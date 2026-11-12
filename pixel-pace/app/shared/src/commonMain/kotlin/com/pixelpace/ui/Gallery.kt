package com.pixelpace.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.pixelpace.domain.LevelCurve
import com.pixelpace.ui.sprite.BossPalette
import com.pixelpace.ui.sprite.HeroPalette
import com.pixelpace.ui.sprite.PixelSprite
import com.pixelpace.ui.sprite.Sprites
import kotlinx.coroutines.delay

/** Design-system gallery (M2). Kept as the KIT tab for visual regression checks. */
@Composable
fun Gallery() {
    var xp by remember { mutableIntStateOf(120) }
    var showModal by remember { mutableStateOf(false) }
    var frame by remember { mutableIntStateOf(0) }
    val level = 4
    val needed = LevelCurve.xpNeeded(level)

    LaunchedEffect(Unit) { while (true) { delay(350); frame = (frame + 1) % Sprites.heroFrames.size } }

    Box(Modifier.fillMaxSize().background(PixelColors.Bg).safeDrawingPadding()) {
        Column(Modifier.fillMaxSize()) {
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                PixelText("PIXEL PACE", color = PixelColors.Lime, size = 22)
                PixelText("Design system", color = PixelColors.InkDim, size = 9)

                PixelCard("HERO · LV $level") {
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        PixelSprite(Sprites.heroFrames[frame], HeroPalette().toMap(), cell = 6.dp)
                        Column(Modifier.weight(1f)) {
                            PixelBar(xp.toFloat() / needed)
                            PixelText("$xp / $needed XP", color = PixelColors.InkDim, size = 8, modifier = Modifier.padding(top = 8.dp))
                        }
                    }
                }

                PixelCard("BUTTONS") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        PixelButton("▶ START RUN") { xp = (xp + 25).coerceAtMost(needed) }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            PixelButton("PAUSE", tone = PixelTone.Amber) {}
                            PixelButton("FINISH", tone = PixelTone.Pink) { xp = 0 }
                            PixelButton("INFO", tone = PixelTone.Ghost) { showModal = true }
                        }
                        PixelButton("DISABLED", enabled = false) {}
                    }
                }

                PixelCard("BARS & TAGS") {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        PixelBar(0.7f, color = PixelColors.Pink)
                        PixelBar(0.4f, color = PixelColors.Cyan, thin = true)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            PixelTag("P1", TagTone.Lime); PixelTag("P2", TagTone.Cyan)
                            PixelTag("LUMPHINI", TagTone.Pink); PixelTag("RESET 18:00", TagTone.Amber)
                        }
                    }
                }

                PixelCard("TEV VERDICTS") {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        PixelVerdict("EFFORT VERIFIED", "XP & quests are counting.", VerdictTone.Ok)
                        PixelVerdict("WATCHING…", "Suspicious signal, still earning XP.", VerdictTone.Warn)
                        PixelVerdict("VEHICULAR FLAG", "XP & quest tracking suspended.", VerdictTone.Fail)
                    }
                }

                PixelCard("BOSS SPRITE") {
                    Box {
                        PixelSprite(Sprites.boss, BossPalette, cell = 8.dp)
                    }
                }
            }
        }

        if (showModal) {
            PixelModal("LEVEL UP!\nLV ${level + 1}", onConfirm = { showModal = false }) {
                PixelSprite(Sprites.heroFrames[0], HeroPalette(shoe = Color(0xFF7CFF4F)).toMap(), cell = 8.dp)
                PixelText("Stamina +6 · Speed +5", color = PixelColors.Ink, size = 8)
            }
        }
    }
}
