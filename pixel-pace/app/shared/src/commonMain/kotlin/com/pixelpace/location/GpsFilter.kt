package com.pixelpace.location

/**
 * Rejects unusable fixes (Phase 1 plan §3.1):
 *  - accuracy worse than [maxAccuracyM]
 *  - fixes inside the [warmUpMs] after the first one (GPS still settling)
 *  - teleports: implied speed above [maxJumpMps] relative to the last accepted fix
 *  - out-of-order timestamps
 * Stateful: create one per run.
 */
class GpsFilter(
    private val maxAccuracyM: Float = 30f,
    private val warmUpMs: Long = 3_000,
    private val maxJumpMps: Double = 12.0,
) {
    private var firstTimeMs: Long? = null
    private var last: GpsFix? = null

    fun accept(fix: GpsFix): Boolean {
        val first = firstTimeMs ?: fix.timeMs.also { firstTimeMs = it }
        if (fix.accuracyM > maxAccuracyM) return false
        if (fix.timeMs - first < warmUpMs) return false

        val prev = last
        if (prev != null) {
            val dt = (fix.timeMs - prev.timeMs) / 1000.0
            if (dt <= 0) return false
            if (GeoMath.distanceM(prev, fix) / dt > maxJumpMps) return false
        }
        last = fix
        return true
    }

    fun reset() { firstTimeMs = null; last = null }
}
