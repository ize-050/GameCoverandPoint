package com.pixelpace.location

data class TrackPoint(val lat: Double, val lng: Double, val timeMs: Long)

data class TrackerState(
    val running: Boolean = false,
    val distanceM: Double = 0.0,
    val elapsedMs: Long = 0,
    val points: List<TrackPoint> = emptyList(),
    val lastFix: GpsFix? = null,
) {
    val paceSecPerKm: Int? get() = if (distanceM < 50) null else (elapsedMs / 1000.0 / (distanceM / 1000.0)).toInt()
}

/**
 * Turns filtered fixes into distance, elapsed time and a trail.
 * Pure logic — no platform code; M4 builds RunSession on top of this.
 */
class RunTracker(private val filter: GpsFilter = GpsFilter()) {
    var state = TrackerState()
        private set

    private var startMs: Long? = null

    fun start() {
        filter.reset(); startMs = null
        state = TrackerState(running = true)
    }

    fun stop() { state = state.copy(running = false) }

    /** feed every raw fix; returns true when it became part of the track */
    fun onFix(fix: GpsFix): Boolean {
        // keep the avatar moving on the map even when the fix is not trusted for distance
        state = state.copy(lastFix = fix)
        if (!state.running || !filter.accept(fix)) return false

        val t0 = startMs ?: fix.timeMs.also { startMs = it }
        val prev = state.points.lastOrNull()
        val added = if (prev == null) 0.0 else GeoMath.haversineM(prev.lat, prev.lng, fix.lat, fix.lng)
        state = state.copy(
            distanceM = state.distanceM + added,
            elapsedMs = fix.timeMs - t0,
            points = state.points + TrackPoint(fix.lat, fix.lng, fix.timeMs),
        )
        return true
    }
}
