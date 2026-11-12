package com.pixelpace.location

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RunTrackerTest {
    // ~11.1 m per 0.0001° latitude
    private fun fix(i: Int, step: Double = 0.0001, acc: Float = 5f, dtMs: Long = 4_000) =
        GpsFix(13.7300 + i * step, 100.54, acc, null, i * dtMs)

    @Test fun haversineKnownDistance() {
        // 1° of latitude ≈ 111.19 km
        val d = GeoMath.haversineM(0.0, 0.0, 1.0, 0.0)
        assertTrue(d in 111_000.0..111_400.0, "got $d")
    }

    @Test fun warmUpFixesAreIgnored() {
        val f = GpsFilter(warmUpMs = 3_000)
        assertFalse(f.accept(fix(0, dtMs = 1_000)))         // t=0, inside warm-up
        assertTrue(f.accept(GpsFix(13.73, 100.54, 5f, null, 3_500)))
    }

    @Test fun poorAccuracyIsRejected() {
        val f = GpsFilter(warmUpMs = 0)
        assertFalse(f.accept(fix(0, acc = 80f)))
        assertTrue(f.accept(fix(1)))
    }

    @Test fun teleportIsRejected() {
        val f = GpsFilter(warmUpMs = 0)
        assertTrue(f.accept(fix(0)))
        // 1 km in 4 s = 250 m/s
        assertFalse(f.accept(GpsFix(13.739, 100.54, 5f, null, 4_000)))
        // a normal step after the glitch is still accepted
        assertTrue(f.accept(fix(2)))
    }

    @Test fun outOfOrderIsRejected() {
        val f = GpsFilter(warmUpMs = 0)
        assertTrue(f.accept(fix(5)))
        assertFalse(f.accept(fix(4)))
    }

    @Test fun trackerAccumulatesDistanceAndTime() {
        val t = RunTracker(GpsFilter(warmUpMs = 0)); t.start()
        repeat(11) { assertTrue(t.onFix(fix(it))) }       // 10 steps × ~11.1 m
        val s = t.state
        assertTrue(s.distanceM in 108.0..114.0, "distance ${s.distanceM}")
        assertEquals(40_000, s.elapsedMs)
        assertEquals(11, s.points.size)
        assertNotNull(s.paceSecPerKm)
    }

    @Test fun notRunningDoesNotRecord() {
        val t = RunTracker(GpsFilter(warmUpMs = 0))
        assertFalse(t.onFix(fix(0)))
        assertTrue(t.state.points.isEmpty())
        assertNotNull(t.state.lastFix)                     // avatar still follows the user
    }

    @Test fun paceHiddenUntilFiftyMeters() {
        val t = RunTracker(GpsFilter(warmUpMs = 0)); t.start()
        t.onFix(fix(0)); t.onFix(fix(1))
        assertNull(t.state.paceSecPerKm)
    }
}
