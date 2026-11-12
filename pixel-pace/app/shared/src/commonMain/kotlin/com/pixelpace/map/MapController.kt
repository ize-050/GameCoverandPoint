package com.pixelpace.map

import com.pixelpace.location.GpsFix
import com.pixelpace.location.TrackPoint
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow

/**
 * Kotlin-side handle for the Leaflet page. Commands become JS snippets that the
 * platform WebView evaluates once the page has loaded (they are buffered until then).
 */
class MapController {
    private val commands = Channel<String>(Channel.UNLIMITED)
    val jsCommands: Flow<String> = commands.receiveAsFlow()

    fun setPlayer(fix: GpsFix, running: Boolean) {
        commands.trySend("PPMap.setPlayer(${fix.lat},${fix.lng},$running)")
    }

    fun appendTrail(lat: Double, lng: Double) {
        commands.trySend("PPMap.appendTrail($lat,$lng)")
    }

    fun clearTrail() {
        commands.trySend("PPMap.reset()")
    }

    /** replace the whole trail (used when the UI re-attaches to a run in progress) */
    fun setTrail(points: List<TrackPoint>) {
        val json = points.joinToString(prefix = "[", postfix = "]") { "[${it.lat},${it.lng}]" }
        commands.trySend("PPMap.setTrail($json)")
    }
}

/** Builds the self-contained HTML (Leaflet inlined) the WebView loads. */
object MapHtml {
    const val BASE_URL = "https://pixelpace.app/"

    fun build(template: String, leafletJs: String, leafletCss: String): String =
        template
            .replace("/*LEAFLET_CSS*/", leafletCss)
            .replace("/*LEAFLET_JS*/", leafletJs)
}
