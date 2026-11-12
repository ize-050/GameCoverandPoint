package com.pixelpace.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pixelpace.location.RunFormat
import com.pixelpace.location.RunHolder
import com.pixelpace.location.RunState
import com.pixelpace.location.RunStatus
import com.pixelpace.location.rememberLocationPermission
import com.pixelpace.location.rememberLocationProvider
import com.pixelpace.location.rememberTrackingHost
import com.pixelpace.map.LeafletMap
import com.pixelpace.map.MapController
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

private const val MOVING_INTERVAL_MS = 1_000L
private const val STILL_INTERVAL_MS = 5_000L

/**
 * M4 run screen. The run itself lives in [RunHolder.session] (process-wide), so it survives this
 * screen leaving composition; on Android a foreground service keeps feeding it with the screen off.
 */
@Composable
fun RunScreen() {
    val session = RunHolder.session
    val state by session.state.collectAsState()
    val permission = rememberLocationPermission()
    val provider = rememberLocationProvider()
    val host = rememberTrackingHost()
    val map = remember { MapController() }

    // The UI listens to GPS unless a foreground service already owns it for the active run.
    val uiOwnsGps = permission.granted && !(host.servicePowered && state.active)
    LaunchedEffect(uiOwnsGps) {
        if (!uiOwnsGps) { provider.stop(); return@LaunchedEffect }
        provider.start { session.onFix(it) }
        // adaptive GPS rate: 1 s while moving, 5 s when standing still
        session.state.map { it.moving }.distinctUntilChanged().collect {
            provider.setUpdateIntervalMs(if (it) MOVING_INTERVAL_MS else STILL_INTERVAL_MS)
        }
    }

    // keep the map in sync with the session; replays the trail when the UI re-attaches mid-run
    LaunchedEffect(Unit) {
        map.setTrail(session.track)
        var shown = session.track.size
        session.state.collect { s ->
            s.lastFix?.let { map.setPlayer(it, s.status == RunStatus.Running) }
            if (s.pointCount < shown) { map.setTrail(session.track); shown = s.pointCount }
            while (shown < s.pointCount) { session.track[shown].let { map.appendTrail(it.lat, it.lng) }; shown++ }
        }
    }

    Box(Modifier.fillMaxSize().background(PixelColors.Bg2)) {
        LeafletMap(map, Modifier.fillMaxSize())

        if (!permission.granted) {
            PixelCard("LOCATION NEEDED", Modifier.align(Alignment.Center).padding(24.dp)) {
                PixelText("Pixel Pace turns the distance you run into XP. Allow location to start.", size = 9)
                Column(Modifier.padding(top = 14.dp)) { PixelButton("ALLOW GPS", onClick = permission::request) }
            }
        } else {
            GpsBadge(state, Modifier.align(Alignment.TopEnd).padding(12.dp))
            ControlPanel(
                state = state,
                modifier = Modifier.align(Alignment.BottomCenter).padding(12.dp),
                onStart = { session.start(); map.clearTrail(); host.onRunStarted() },
                onPause = { session.pause() },
                onResume = { session.resume() },
                onFinish = { session.finish(); host.onRunEnded() },
            )
            if (state.status == RunStatus.Finished) {
                PixelModal("RUN COMPLETE", confirmLabel = "NEW RUN", onConfirm = { session.reset(); map.clearTrail() }) {
                    PixelText("${RunFormat.km(state.distanceM)} km  ·  ${RunFormat.time(state.elapsedMs)}", size = 11, align = TextAlign.Center)
                    PixelText("Avg pace ${RunFormat.pace(state.paceSecPerKm)} /km", color = PixelColors.InkDim, size = 8)
                }
            }
        }
    }
}

@Composable
private fun GpsBadge(state: RunState, modifier: Modifier) {
    val acc = state.lastFix?.accuracyM
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (state.status == RunStatus.Paused) PixelTag("PAUSED", TagTone.Amber)
        else if (state.active && !state.moving) PixelTag("STANDING", TagTone.Neutral)
        PixelTag(
            if (acc == null) "GPS: SEARCHING" else "GPS ±${acc.toInt()}m",
            if (acc == null) TagTone.Amber else if (acc <= 30f) TagTone.Lime else TagTone.Red,
        )
    }
}

@Composable
private fun ControlPanel(
    state: RunState,
    modifier: Modifier,
    onStart: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onFinish: () -> Unit,
) {
    PixelCard(modifier = modifier) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Stat(RunFormat.km(state.distanceM), "KM")
            Stat(RunFormat.time(state.elapsedMs), "TIME")
            Stat(RunFormat.pace(state.paceSecPerKm), "PACE/KM")
        }
        Row(Modifier.padding(top = 14.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            when (state.status) {
                RunStatus.Idle, RunStatus.Finished ->
                    PixelButton("▶ START RUN", Modifier.weight(1f), fillWidth = true, onClick = onStart)
                RunStatus.Running -> {
                    PixelButton("❚❚ PAUSE", Modifier.weight(1f), tone = PixelTone.Amber, fillWidth = true, onClick = onPause)
                    PixelButton("■ FINISH", Modifier.weight(1f), tone = PixelTone.Pink, fillWidth = true, onClick = onFinish)
                }
                RunStatus.Paused -> {
                    PixelButton("▶ RESUME", Modifier.weight(1f), fillWidth = true, onClick = onResume)
                    PixelButton("■ FINISH", Modifier.weight(1f), tone = PixelTone.Pink, fillWidth = true, onClick = onFinish)
                }
            }
        }
    }
}

@Composable
private fun Stat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        PixelText(value, size = 14, align = TextAlign.Center)
        PixelText(label, color = PixelColors.InkDim, size = 6, modifier = Modifier.padding(top = 8.dp))
    }
}
