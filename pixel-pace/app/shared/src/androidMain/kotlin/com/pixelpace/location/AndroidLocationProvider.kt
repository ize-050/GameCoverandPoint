package com.pixelpace.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper

/** GPS via the platform LocationManager. Used by the UI (idle preview) and by [TrackingService]. */
internal class AndroidLocationProvider(context: Context) : LocationProvider {
    private val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var listener: LocationListener? = null
    private var intervalMs = 1_000L

    @SuppressLint("MissingPermission") // callers gate on location permission
    override fun start(onFix: (GpsFix) -> Unit) {
        if (listener != null) return
        val l = LocationListener { loc ->
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
        register(l)
    }

    @SuppressLint("MissingPermission")
    private fun register(l: LocationListener) {
        manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, intervalMs, 0f, l, Looper.getMainLooper())
    }

    override fun setUpdateIntervalMs(ms: Long) {
        if (ms == intervalMs) return
        intervalMs = ms
        listener?.let { manager.removeUpdates(it); register(it) }
    }

    override fun stop() {
        listener?.let { manager.removeUpdates(it) }
        listener = null
    }
}
