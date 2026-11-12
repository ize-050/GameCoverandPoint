package com.pixelpace.location

import androidx.compose.runtime.Composable

/** Creates the platform [LocationProvider] bound to the composition's lifetime. */
@Composable
expect fun rememberLocationProvider(): LocationProvider

/** Foreground location permission state + a way to ask for it. */
interface LocationPermission {
    val granted: Boolean
    fun request()
}

@Composable
expect fun rememberLocationPermission(): LocationPermission
