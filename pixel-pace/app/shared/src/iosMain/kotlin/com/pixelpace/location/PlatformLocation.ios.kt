package com.pixelpace.location

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.useContents
import kotlinx.coroutines.delay
import platform.CoreLocation.CLAuthorizationStatus
import platform.CoreLocation.CLLocation
import platform.CoreLocation.CLLocationManager
import platform.CoreLocation.CLLocationManagerDelegateProtocol
import platform.CoreLocation.kCLAuthorizationStatusAuthorizedAlways
import platform.CoreLocation.kCLAuthorizationStatusAuthorizedWhenInUse
import platform.CoreLocation.kCLDistanceFilterNone
import platform.CoreLocation.kCLLocationAccuracyBest
import platform.Foundation.timeIntervalSince1970
import platform.darwin.NSObject

/** Objective-C delegate; Kotlin/Native forbids mixing it with a Kotlin interface, so it is a separate class. */
@OptIn(ExperimentalForeignApi::class)
private class LocationDelegate : NSObject(), CLLocationManagerDelegateProtocol {
    var callback: ((GpsFix) -> Unit)? = null

    override fun locationManager(manager: CLLocationManager, didUpdateLocations: List<*>) {
        val cb = callback ?: return
        didUpdateLocations.forEach { item ->
            val loc = item as? CLLocation ?: return@forEach
            val (lat, lng) = loc.coordinate.useContents { latitude to longitude }
            cb(
                GpsFix(
                    lat = lat,
                    lng = lng,
                    accuracyM = if (loc.horizontalAccuracy >= 0) loc.horizontalAccuracy.toFloat() else Float.MAX_VALUE,
                    speedMps = if (loc.speed >= 0) loc.speed.toFloat() else null,
                    timeMs = (loc.timestamp.timeIntervalSince1970 * 1000).toLong(),
                ),
            )
        }
    }
}

@OptIn(ExperimentalForeignApi::class)
private class IosLocationProvider : LocationProvider {
    private val manager = CLLocationManager()
    private val delegate = LocationDelegate() // CLLocationManager.delegate is weak: keep a strong ref here

    init {
        manager.delegate = delegate
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
    }

    override fun start(onFix: (GpsFix) -> Unit) {
        delegate.callback = onFix
        manager.startUpdatingLocation()
    }

    override fun stop() {
        manager.stopUpdatingLocation()
        delegate.callback = null
    }
}

@Composable
actual fun rememberLocationProvider(): LocationProvider {
    val provider = remember { IosLocationProvider() }
    DisposableEffect(provider) { onDispose { provider.stop() } }
    return provider
}

private fun CLAuthorizationStatus.isGranted() =
    this == kCLAuthorizationStatusAuthorizedWhenInUse || this == kCLAuthorizationStatusAuthorizedAlways

@Composable
actual fun rememberLocationPermission(): LocationPermission {
    val manager = remember { CLLocationManager() }
    var granted by remember { mutableStateOf(manager.authorizationStatus.isGranted()) }
    // iOS gives no callback to a bare manager here; poll while the screen is composed
    LaunchedEffect(manager) {
        while (true) { granted = manager.authorizationStatus.isGranted(); delay(500) }
    }
    return remember(granted) {
        object : LocationPermission {
            override val granted = granted
            override fun request() = manager.requestWhenInUseAuthorization()
        }
    }
}
