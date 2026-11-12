package com.pixelpace.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext

private class AndroidLocationProvider(context: Context) : LocationProvider {
    private val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var listener: LocationListener? = null

    @SuppressLint("MissingPermission") // callers gate on rememberLocationPermission()
    override fun start(onFix: (GpsFix) -> Unit) {
        if (listener != null) return
        val l = LocationListener { loc: Location ->
            onFix(
                GpsFix(
                    lat = loc.latitude,
                    lng = loc.longitude,
                    accuracyM = if (loc.hasAccuracy()) loc.accuracy else Float.MAX_VALUE,
                    speedMps = if (loc.hasSpeed()) loc.speed else null,
                    timeMs = loc.time,
                ),
            )
        }
        listener = l
        // 1 s interval; adaptive rate (5 s when stopped) arrives with the run engine in M4
        manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1_000L, 0f, l, Looper.getMainLooper())
    }

    override fun stop() {
        listener?.let { manager.removeUpdates(it) }
        listener = null
    }
}

@Composable
actual fun rememberLocationProvider(): LocationProvider {
    val context = LocalContext.current
    val provider = remember { AndroidLocationProvider(context.applicationContext) }
    DisposableEffect(provider) { onDispose { provider.stop() } }
    return provider
}

@Composable
actual fun rememberLocationPermission(): LocationPermission {
    val context = LocalContext.current
    fun check() = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    var granted by remember { mutableStateOf(check()) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        granted = check()
    }
    return remember(granted) {
        object : LocationPermission {
            override val granted = granted
            override fun request() {
                launcher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
            }
        }
    }
}
