package com.pixelpace.map

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.pixelpace.shared.resources.Res
import org.jetbrains.compose.resources.ExperimentalResourceApi

/** Platform WebView hosting [html]; evaluates [controller] commands after load. */
@Composable
expect fun PlatformWebMap(html: String, controller: MapController, modifier: Modifier)

/** Loads the bundled Leaflet page then shows it. Shows nothing until the assets are read. */
@OptIn(ExperimentalResourceApi::class)
@Composable
fun LeafletMap(controller: MapController, modifier: Modifier = Modifier) {
    var html by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        html = MapHtml.build(
            template = Res.readBytes("files/map/map.html").decodeToString(),
            leafletJs = Res.readBytes("files/map/leaflet.js").decodeToString(),
            leafletCss = Res.readBytes("files/map/leaflet.css").decodeToString(),
        )
    }
    html?.let { PlatformWebMap(it, controller, modifier) }
}
