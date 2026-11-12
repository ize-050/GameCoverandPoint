package com.pixelpace.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/* Hard-edged, square, no rounded corners: the 8-bit look. Mirrors css/style.css in the HTML demo. */

@Composable
fun PixelText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = PixelColors.Ink,
    size: Int = 10,
    align: TextAlign? = null,
) {
    Text(
        text = text,
        color = color,
        fontSize = size.sp,
        lineHeight = (size * 1.6f).sp,
        fontFamily = rememberPixelFont(),
        textAlign = align,
        modifier = modifier,
    )
}

enum class PixelTone(val face: Color, val shade: Color, val light: Color, val ink: Color) {
    Lime(PixelColors.Lime, PixelColors.LimeD, Color(0xFFC9FFB0), PixelColors.Black),
    Pink(PixelColors.Pink, PixelColors.PinkD, Color(0xFFFFB0D6), Color.White),
    Amber(PixelColors.Amber, PixelColors.AmberD, Color(0xFFFFF0B0), PixelColors.Black),
    Ghost(PixelColors.Panel2, Color(0xFF15132F), Color(0xFF3F3B7A), PixelColors.Ink),
}

/** bevelled button: light top-left edge, dark bottom-right edge, hard drop shadow */
@Composable
fun PixelButton(
    label: String,
    modifier: Modifier = Modifier,
    tone: PixelTone = PixelTone.Lime,
    enabled: Boolean = true,
    fillWidth: Boolean = false,
    onClick: () -> Unit,
) {
    val px = PixelDimens.Px
    Box(modifier = modifier.padding(end = px, bottom = px)) {
        Box(Modifier.matchParentSize().offset(px, px).background(PixelColors.Black))
        Box(
            Modifier
                .then(if (fillWidth) Modifier.fillMaxWidth() else Modifier)
                .border(px, PixelColors.Black)
                .background(tone.face)
                .drawBehind { // bevel
                    val b = 4.dp.toPx()          // bevel thickness
                    val o = PixelDimens.Px.toPx() // sits just inside the black border
                    val w = size.width - 2 * o; val h = size.height - 2 * o
                    drawRect(tone.light, Offset(o, o), Size(w, b))
                    drawRect(tone.light, Offset(o, o), Size(b, h))
                    drawRect(tone.shade, Offset(o, o + h - b), Size(w, b))
                    drawRect(tone.shade, Offset(o + w - b, o), Size(b, h))
                }
                .clickable(enabled = enabled, onClick = onClick)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            contentAlignment = Alignment.Center,
        ) { PixelText(label, color = tone.ink.copy(alpha = if (enabled) 1f else 0.45f), size = 10) }
    }
}

@Composable
fun PixelCard(title: String? = null, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val px = PixelDimens.Px
    Box(modifier = modifier.fillMaxWidth().padding(end = px, bottom = px)) {
        Box(Modifier.matchParentSize().offset(px, px).background(PixelColors.Black))
        Column(
            Modifier.fillMaxWidth().border(px, PixelColors.Line).background(PixelColors.Panel).padding(12.dp),
        ) {
            if (title != null) {
                PixelText(title, color = PixelColors.Cyan, size = 9)
                Box(Modifier.height(10.dp))
            }
            content()
        }
    }
}

/** progress in 0f..1f, drawn as a segmented bar */
@Composable
fun PixelBar(
    progress: Float,
    modifier: Modifier = Modifier,
    color: Color = PixelColors.Lime,
    thin: Boolean = false,
) {
    val p = progress.coerceIn(0f, 1f)
    Box(
        modifier.fillMaxWidth().height(if (thin) 12.dp else 18.dp)
            .border(3.dp, PixelColors.Line).background(PixelColors.Black),
    ) {
        Box(
            Modifier.fillMaxHeight().fillMaxWidth(p).background(color).drawBehind {
                val seg = 6.dp.toPx(); val gap = 2.dp.toPx()
                var x = seg
                while (x < size.width) { drawRect(Color(0x30000000), Offset(x, 0f), Size(gap, size.height)); x += seg + gap }
            },
        )
    }
}

enum class TagTone(val ink: Color, val edge: Color) {
    Neutral(PixelColors.InkDim, PixelColors.Line),
    Lime(PixelColors.Lime, PixelColors.LimeD),
    Pink(PixelColors.Pink, PixelColors.PinkD),
    Amber(PixelColors.Amber, PixelColors.AmberD),
    Cyan(PixelColors.Cyan, Color(0xFF1B8CA3)),
    Red(PixelColors.Red, Color(0xFF9E1F1F)),
}

@Composable
fun PixelTag(text: String, tone: TagTone = TagTone.Neutral, modifier: Modifier = Modifier) {
    Box(modifier.border(2.dp, tone.edge).background(PixelColors.Panel2).padding(horizontal = 6.dp, vertical = 4.dp)) {
        PixelText(text, color = tone.ink, size = 7)
    }
}

/** verdict banner used by True-Effort Verification and run alerts */
enum class VerdictTone(val bg: Color, val ink: Color) {
    Ok(PixelColors.Lime, PixelColors.Black),
    Warn(PixelColors.Amber, PixelColors.Black),
    Fail(PixelColors.Red, Color.White),
    Idle(PixelColors.Panel2, PixelColors.InkDim),
}

@Composable
fun PixelVerdict(title: String, subtitle: String, tone: VerdictTone, modifier: Modifier = Modifier) {
    val px = PixelDimens.Px
    Box(modifier.fillMaxWidth().padding(end = px, bottom = px)) {
        Box(Modifier.matchParentSize().offset(px, px).background(PixelColors.Black))
        Column(
            Modifier.fillMaxWidth().border(px, PixelColors.Black).background(tone.bg).padding(14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            PixelText(title, color = tone.ink, size = 12, align = TextAlign.Center)
            Box(Modifier.height(6.dp))
            PixelText(subtitle, color = tone.ink, size = 7, align = TextAlign.Center)
        }
    }
}

/** modal dialog box with a dimmed scrim; place inside a full-size Box */
@Composable
fun BoxScope.PixelModal(
    title: String,
    confirmLabel: String = "AWESOME!",
    onConfirm: () -> Unit,
    body: @Composable ColumnScope.() -> Unit,
) {
    Box(Modifier.matchParentSize().background(Color(0xD905040D)).clickable(enabled = false) {}, contentAlignment = Alignment.Center) {
        Column(
            Modifier.padding(24.dp).fillMaxWidth().border(PixelDimens.Px, PixelColors.Amber).background(PixelColors.Panel).padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            PixelText(title, color = PixelColors.Amber, size = 14, align = TextAlign.Center)
            body()
            PixelButton(confirmLabel, onClick = onConfirm)
        }
    }
}

data class NavItem(val id: String, val label: String)

/** bottom navigation with a lime selection bar, as in the demo */
@Composable
fun PixelNavBar(items: List<NavItem>, selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().background(PixelColors.Black).border(PixelDimens.Px, PixelColors.Line)) {
        items.forEach { item ->
            val on = item.id == selected
            Box(
                Modifier.weight(1f).height(64.dp).clickable { onSelect(item.id) },
                contentAlignment = Alignment.Center,
            ) {
                if (on) Box(Modifier.align(Alignment.TopCenter).fillMaxWidth(0.56f).height(4.dp).background(PixelColors.Lime))
                PixelText(item.label, color = if (on) PixelColors.Lime else PixelColors.InkDim, size = 7)
            }
        }
    }
}
