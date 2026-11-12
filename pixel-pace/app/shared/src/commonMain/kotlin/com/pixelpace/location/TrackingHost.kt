package com.pixelpace.location

import androidx.compose.runtime.Composable

/**
 * Keeps a run alive when the app is not on screen.
 *  - Android: a foreground service owns the GPS ([servicePowered] = true), so the UI must NOT also listen.
 *  - iOS: the UI's CLLocationManager keeps running in the background (background mode), nothing to host.
 */
interface TrackingHost {
    val servicePowered: Boolean
    fun onRunStarted()
    fun onRunEnded()
}

@Composable
expect fun rememberTrackingHost(): TrackingHost
