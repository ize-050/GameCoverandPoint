package com.pixelpace.location

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

@Composable
actual fun rememberTrackingHost(): TrackingHost {
    val context = LocalContext.current.applicationContext
    return remember {
        object : TrackingHost {
            override val servicePowered = true
            override fun onRunStarted() = TrackingService.start(context)
            override fun onRunEnded() = TrackingService.stop(context)
        }
    }
}
