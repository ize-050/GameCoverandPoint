package com.pixelpace.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

private val tabs = listOf(NavItem("run", "RUN"), NavItem("kit", "KIT"))

@Composable
fun App() {
    var tab by remember { mutableStateOf("run") }
    Column(Modifier.fillMaxSize().background(PixelColors.Bg).safeDrawingPadding()) {
        Box(Modifier.weight(1f)) {
            // RunScreen stays composed so GPS + the map survive tab switches
            Box(Modifier.fillMaxSize()) { RunScreen() }
            if (tab == "kit") Box(Modifier.fillMaxSize().background(PixelColors.Bg)) { Gallery() }
        }
        PixelNavBar(items = tabs, selected = tab, onSelect = { tab = it })
    }
}
