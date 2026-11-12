package com.pixelpace.location

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

enum class RunStatus { Idle, Running, Paused, Finished }

data class TrackPoint(val lat: Double, val lng: Double, val timeMs: Long)

data class RunState(
    val status: RunStatus = RunStatus.Idle,
    val distanceM: Double = 0.0,
    /** moving time: pauses are excluded */
    val elapsedMs: Long = 0,
    val pointCount: Int = 0,
    /** latest raw fix, even when not recorded — keeps the avatar on the map */
    val lastFix: GpsFix? = null,
    /** false after ~10 s of standing still; drives the adaptive GPS rate */
    val moving: Boolean = true,
) {
    val paceSecPerKm: Int? get() = if (distanceM < 50) null else (elapsedMs / 1000.0 / (distanceM / 1000.0)).toInt()
    val active: Boolean get() = status == RunStatus.Running || status == RunStatus.Paused
}

/**
 * The run engine: filtered GPS fixes → distance, moving time, trail.
 * Platform-free and process-wide (see [RunHolder]) so a background service can keep
 * feeding it while the UI comes and goes. Call from one thread (the main thread).
 */
class RunSession(
    private val newFilter: () -> GpsFilter = { GpsFilter() },
    /** GPS jitter guard: positions closer than this to the last recorded one are not recorded */
    private val minStepM: Double = 2.0,
    private val stillWindowMs: Long = 10_000,
    private val stillRadiusM: Double = 5.0,
) {
    private val _state = MutableStateFlow(RunState())
    val state: StateFlow<RunState> = _state

    private val _track = ArrayList<TrackPoint>()
    /** recorded trail; grows during a run. Read-only for callers. */
    val track: List<TrackPoint> get() = _track

    private var filter = newFilter()
    private var lastTimeMs: Long? = null
    private var lastPoint: TrackPoint? = null
    private val recent = ArrayDeque<TrackPoint>()

    fun start() {
        _track.clear(); resetSegment()
        _state.value = RunState(status = RunStatus.Running, lastFix = _state.value.lastFix)
    }

    fun pause() {
        if (_state.value.status == RunStatus.Running) _state.value = _state.value.copy(status = RunStatus.Paused)
    }

    fun resume() {
        if (_state.value.status != RunStatus.Paused) return
        resetSegment() // no distance/time is credited across the pause
        _state.value = _state.value.copy(status = RunStatus.Running, moving = true)
    }

    fun finish() {
        if (_state.value.active) _state.value = _state.value.copy(status = RunStatus.Finished)
    }

    /** back to Idle, discarding the run (call after the summary is dismissed) */
    fun reset() {
        _track.clear(); resetSegment()
        _state.value = RunState(lastFix = _state.value.lastFix)
    }

    private fun resetSegment() {
        filter = newFilter(); lastTimeMs = null; lastPoint = null; recent.clear()
    }

    /** feed every raw fix; returns true when it extended the recorded trail */
    fun onFix(fix: GpsFix): Boolean {
        val s = _state.value.copy(lastFix = fix)
        if (s.status != RunStatus.Running || !filter.accept(fix)) { _state.value = s; return false }

        val prevTime = lastTimeMs
        val elapsed = if (prevTime == null) s.elapsedMs else s.elapsedMs + (fix.timeMs - prevTime)
        lastTimeMs = fix.timeMs

        val here = TrackPoint(fix.lat, fix.lng, fix.timeMs)
        val prev = lastPoint
        val step = if (prev == null) 0.0 else GeoMath.haversineM(prev.lat, prev.lng, here.lat, here.lng)
        var added = false
        var distance = s.distanceM
        if (prev == null || step >= minStepM) {
            _track.add(here); lastPoint = here; distance += step; added = true
        }

        _state.value = s.copy(distanceM = distance, elapsedMs = elapsed, pointCount = _track.size, moving = isMoving(here, s.moving))
        return added
    }

    /** moving unless the last [stillWindowMs] of fixes stayed inside [stillRadiusM] */
    private fun isMoving(now: TrackPoint, previous: Boolean): Boolean {
        recent.addLast(now)
        while (recent.size > 1 && now.timeMs - recent.first().timeMs > stillWindowMs) recent.removeFirst()
        val first = recent.first()
        if (now.timeMs - first.timeMs < stillWindowMs * 0.8) return previous // not enough history yet
        return GeoMath.haversineM(first.lat, first.lng, now.lat, now.lng) >= stillRadiusM
    }
}

/** Process-wide session so the Android foreground service and the UI share one run. */
object RunHolder {
    val session = RunSession()
}

/** Compact formatting shared by UI and the Android notification. */
object RunFormat {
    private fun pad2(n: Long) = n.toString().padStart(2, '0')

    fun km(meters: Double): String {
        val c = (meters / 10).toInt()
        return "${c / 100}.${(c % 100).toString().padStart(2, '0')}"
    }

    fun time(ms: Long): String {
        val s = ms / 1000
        return if (s >= 3600) "${s / 3600}:${pad2(s % 3600 / 60)}:${pad2(s % 60)}" else "${pad2(s / 60)}:${pad2(s % 60)}"
    }

    fun pace(secPerKm: Int?): String = if (secPerKm == null) "--:--" else "${pad2(secPerKm / 60L)}:${pad2(secPerKm % 60L)}"
}
