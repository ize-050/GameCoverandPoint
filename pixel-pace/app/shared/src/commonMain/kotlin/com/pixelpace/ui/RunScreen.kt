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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pixelpace.location.RunTracker
import com.pixelpace.location.rememberLocationPermission
import com.pixelpace.location.rememberLocationProvider
import com.pixelpace.map.LeafletMap
import com.pixelpace.map.MapController

private fun pad2(n: Long) = n.toString().padStart(2, '0')
internal fun formatKm(m: Double): String { val c = (m / 10).toInt(); return "${c / 100}.${(c % 100).toString().padStart(2, '0')}" }
internal fun formatTime(ms: Long): String { val s = ms / 1000; return "${pad2(s / 60)}:${pad2(s % 60)}" }
internal fun formatPace(secPerKm: Int?): String = if (secPerKm == null) "--:--" else "${pad2(secPerKm / 60L)}:${pad2(secPerKm % 60L)}"

/** M3 run screen: live Leaflet map, GPS permission gate, distance / time / pace from filtered fixes. */
@Composable
fun RunScreen() {
    val permission = rememberLocationPermission()
    val provider = rememberLocationProvider()
    val tracker = remember { RunTracker() }
    val map = remember { MapController() }
    var state by remember { mutableStateOf(tracker.state) }

    LaunchedEffect(permission.granted) {
        if (!permission.granted) return@LaunchedEffect
        provider.start { fix ->
            val accepted = tracker.onFix(fix)
            state = tracker.state
            map.setPlayer(fix, state.running)
            if (accepted) map.appendTrail(fix.lat, fix.lng)
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
            val acc = state.lastFix?.accuracyM
            Row(Modifier.align(Alignment.TopEnd).padding(12.dp)) {
                PixelTag(
                    if (acc == null) "GPS: SEARCHING" else "GPS ±${acc.toInt()}m",
                    if (acc == null) TagTone.Amber else if (acc <= 30f) TagTone.Lime else TagTone.Red,
                )
            }
            PixelCard(modifier = Modifier.align(Alignment.BottomCenter).padding(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Stat(formatKm(state.distanceM), "KM")
                    Stat(formatTime(state.elapsedMs), "TIME")
                    Stat(formatPace(state.paceSecPerKm), "PACE/KM")
                }
                Column(Modifier.padding(top = 14.dp)) {
                    if (state.running) {
                        PixelButton("■ FINISH", Modifier.fillMaxWidth(), tone = PixelTone.Pink, fillWidth = true) {
                            tracker.stop(); state = tracker.state
                        }
                    } else {
                        PixelButton("▶ START RUN", Modifier.fillMaxWidth(), fillWidth = true) {
                            tracker.start(); map.clearTrail(); state = tracker.state
                        }
                    }
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
