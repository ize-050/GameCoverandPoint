package com.pixelpace.location

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember

/**
 * iOS keeps delivering fixes to the foreground-started CLLocationManager while backgrounded
 * (UIBackgroundModes = location, allowsBackgroundLocationUpdates = true), so nothing to host.
 */
@Composable
actual fun rememberTrackingHost(): TrackingHost = remember {
    object : TrackingHost {
        override val servicePowered = false
        override fun onRunStarted() {}
        override fun onRunEnded() {}
    }
}
