package com.pixelpace.location

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class GpsFilterTest {
    // ~11.1 m per 0.0001° latitude
    private fun fix(i: Int, step: Double = 0.0001, acc: Float = 5f, dtMs: Long = 4_000) =
        GpsFix(13.7300 + i * step, 100.54, acc, null, i * dtMs)

    @Test fun haversineKnownDistance() {
        val d = GeoMath.haversineM(0.0, 0.0, 1.0, 0.0) // 1° latitude ≈ 111.19 km
        assertTrue(d in 111_000.0..111_400.0, "got $d")
    }

    @Test fun warmUpFixesAreIgnored() {
        val f = GpsFilter(warmUpMs = 3_000)
        assertFalse(f.accept(fix(0, dtMs = 1_000)))
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
        assertFalse(f.accept(GpsFix(13.739, 100.54, 5f, null, 4_000))) // 1 km in 4 s
        assertTrue(f.accept(fix(2)))                                   // normal step still fine
    }

    @Test fun outOfOrderIsRejected() {
        val f = GpsFilter(warmUpMs = 0)
        assertTrue(f.accept(fix(5)))
        assertFalse(f.accept(fix(4)))
    }
}
