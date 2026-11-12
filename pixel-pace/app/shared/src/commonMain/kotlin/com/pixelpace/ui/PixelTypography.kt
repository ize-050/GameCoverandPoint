package com.pixelpace.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.text.font.FontFamily
import com.pixelpace.shared.resources.Res
import com.pixelpace.shared.resources.press_start_2p
import org.jetbrains.compose.resources.Font

/** Press Start 2P (SIL OFL 1.1) bundled in composeResources/font. */
@Composable
fun rememberPixelFont(): FontFamily {
    val font = Font(Res.font.press_start_2p)
    return remember(font) { FontFamily(font) }
}
