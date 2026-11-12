package com.pixelpace.location

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RunSessionTest {
    private fun session() = RunSession(newFilter = { GpsFilter(warmUpMs = 0) })

    /** i-th fix on a northward walk: ~11.1 m and 4 s apart */
    private fun fix(i: Int, t0: Long = 0, lat0: Double = 13.7300) =
        GpsFix(lat0 + i * 0.0001, 100.54, 5f, null, t0 + i * 4_000L)

    @Test fun accumulatesDistanceAndTime() {
        val s = session(); s.start()
        repeat(11) { assertTrue(s.onFix(fix(it))) }
        val st = s.state.value
        assertTrue(st.distanceM in 108.0..114.0, "distance ${st.distanceM}")
        assertEquals(40_000, st.elapsedMs)
        assertEquals(11, st.pointCount)
        assertNotNull(st.paceSecPerKm)
    }

    @Test fun idleSessionDoesNotRecordButFollowsUser() {
        val s = session()
        assertFalse(s.onFix(fix(0)))
        assertTrue(s.track.isEmpty())
        assertNotNull(s.state.value.lastFix)
    }

    @Test fun paceHiddenUntilFiftyMeters() {
        val s = session(); s.start(); s.onFix(fix(0)); s.onFix(fix(1))
        assertNull(s.state.value.paceSecPerKm)
    }

    @Test fun pauseFreezesRunAndResumeCreditsNothingForTheGap() {
        val s = session(); s.start()
        repeat(6) { s.onFix(fix(it)) }                       // 5 steps ≈ 55 m, 20 s
        val before = s.state.value
        s.pause()
        assertEquals(RunStatus.Paused, s.state.value.status)
        assertFalse(s.onFix(fix(7)))                         // ignored while paused
        assertEquals(before.distanceM, s.state.value.distanceM)

        s.resume()
        // user walked 1 km north and 10 minutes passed while paused — none of it counts
        val far = fix(0, t0 = 600_000, lat0 = 13.7400)
        assertTrue(s.onFix(far))
        assertEquals(before.distanceM, s.state.value.distanceM, 0.001)
        assertEquals(before.elapsedMs, s.state.value.elapsedMs)

        assertTrue(s.onFix(fix(1, t0 = 600_000, lat0 = 13.7400)))
        assertEquals(before.elapsedMs + 4_000, s.state.value.elapsedMs)
        assertTrue(s.state.value.distanceM > before.distanceM)
    }

    @Test fun jitterBelowMinStepIsNotRecorded() {
        val s = session(); s.start()
        s.onFix(fix(0))
        // 0.00001° ≈ 1.1 m: below the 2 m guard
        repeat(5) { assertFalse(s.onFix(GpsFix(13.7300 + 0.00001 * (it % 2), 100.54, 5f, null, (it + 1) * 1_000L))) }
        assertEquals(1, s.track.size)
        assertEquals(0.0, s.state.value.distanceM)
        assertTrue(s.state.value.elapsedMs > 0) // time still advances
    }

    @Test fun standingStillFlipsMovingOffAndWalkingFlipsItBack() {
        val s = session(); s.start()
        repeat(4) { s.onFix(fix(it)) }
        assertTrue(s.state.value.moving)
        // stand still for 14 s at the last position
        val last = fix(3)
        for (i in 1..14) s.onFix(GpsFix(last.lat, last.lng, 5f, null, last.timeMs + i * 1_000L))
        assertFalse(s.state.value.moving)
        // walk again
        val t = last.timeMs + 14_000
        for (i in 1..12) s.onFix(GpsFix(last.lat + i * 0.00002, last.lng, 5f, null, t + i * 1_000L)) // ~2.2 m/s
        assertTrue(s.state.value.moving)
    }

    @Test fun finishStopsRecordingAndResetReturnsToIdle() {
        val s = session(); s.start(); s.onFix(fix(0)); s.onFix(fix(1))
        s.finish()
        assertEquals(RunStatus.Finished, s.state.value.status)
        assertFalse(s.onFix(fix(2)))
        s.reset()
        assertEquals(RunStatus.Idle, s.state.value.status)
        assertTrue(s.track.isEmpty())
        assertEquals(0.0, s.state.value.distanceM)
    }

    @Test fun formatHelpers() {
        assertEquals("1.23", RunFormat.km(1234.0))
        assertEquals("05:07", RunFormat.time(307_000))
        assertEquals("1:01:01", RunFormat.time(3_661_000))
        assertEquals("--:--", RunFormat.pace(null))
        assertEquals("06:00", RunFormat.pace(360))
    }
}
