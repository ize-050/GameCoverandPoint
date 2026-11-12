package com.pixelpace.location

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** One raw GPS reading, platform-neutral. */
data class GpsFix(
    val lat: Double,
    val lng: Double,
    val accuracyM: Float,
    val speedMps: Float?,
    val timeMs: Long,
)

object GeoMath {
    private const val EARTH_R = 6_371_000.0

    fun haversineM(aLat: Double, aLng: Double, bLat: Double, bLng: Double): Double {
        val r = kotlin.math.PI / 180
        val dLat = (bLat - aLat) * r
        val dLng = (bLng - aLng) * r
        val x = sin(dLat / 2).let { it * it } + cos(aLat * r) * cos(bLat * r) * sin(dLng / 2).let { it * it }
        return 2 * EARTH_R * asin(sqrt(x))
    }

    fun distanceM(a: GpsFix, b: GpsFix) = haversineM(a.lat, a.lng, b.lat, b.lng)
}

/** Source of fixes. Android: LocationManager. iOS: CLLocationManager. */
interface LocationProvider {
    /** begin delivering fixes to [onFix]; safe to call repeatedly */
    fun start(onFix: (GpsFix) -> Unit)
    fun stop()
}
