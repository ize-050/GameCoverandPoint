package com.pixelpace.ui.sprite

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.floor

/**
 * Draws a [SpriteSheet] as crisp rectangles — no bitmap scaling, so it is pixel-perfect
 * at any density. [cell] is the size of one sprite pixel.
 */
@Composable
fun PixelSprite(
    sheet: SpriteSheet,
    palette: Map<Char, Color>,
    modifier: Modifier = Modifier,
    cell: Dp = 6.dp,
) {
    Canvas(modifier.size(cell * sheet.width, cell * sheet.height)) {
        // snap to whole device pixels to avoid seams between neighbouring cells
        val c = floor(cell.toPx()).coerceAtLeast(1f)
        sheet.rows.forEachIndexed { y, row ->
            row.forEachIndexed { x, ch ->
                val color = palette[ch] ?: return@forEachIndexed
                drawRect(color, Offset(x * c, y * c), Size(c, c))
            }
        }
    }
}
