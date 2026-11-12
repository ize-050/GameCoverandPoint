package com.pixelpace.location

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext

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
                val wanted = buildList {
                    add(Manifest.permission.ACCESS_FINE_LOCATION)
                    add(Manifest.permission.ACCESS_COARSE_LOCATION)
                    // Android 13+: needed to show the "run in progress" notification of the tracking service
                    if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
                }
                launcher.launch(wanted.toTypedArray())
            }
        }
    }
}
