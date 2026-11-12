package com.pixelpace.ui.sprite

import androidx.compose.ui.graphics.Color

/**
 * Sprite art as ASCII grids — direct port of `PP.sprite` in the HTML demo (js/engine.js).
 * Each char maps to a palette color; '.' is transparent.
 */
class SpriteSheet(val rows: List<String>) {
    val width = rows.maxOf { it.length }
    val height = rows.size
}

object Sprites {
    private val heroBase = listOf(
        "....hhhh....",
        "...hhhhhh...",
        "..hhhhhhhh..",
        "..hsssssss..",
        "..sskssksss.",
        "..ssssssss..",
        "...ssssss...",
        "..bbbbbbbb..",
        ".abbbbbbbba.",
        ".abbbbbbbba.",
        "..bbbbbbbb..",
    )
    private val heroLegs = listOf(
        listOf("..pppppppp..", "..pppppppp..", "..ppp..ppp..", "..ppp..ppp..", ".wwww..wwww."),
        listOf("..pppppppp..", "..pppppppp..", "...ppp.ppp..", "..ppp...ppp.", ".wwww...wwww"),
    )

    /** two running frames */
    val heroFrames: List<SpriteSheet> = heroLegs.map { SpriteSheet(heroBase + it) }

    val boss = SpriteSheet(
        listOf(
            "................",
            "...r........r...",
            "..rrr......rrr..",
            "..rrrrrrrrrrrr..",
            ".rrrrrrrrrrrrrr.",
            ".rrwwrrrrrrwwrr.",
            ".rrwkrrrrrrkwrr.",
            ".rrrrrrrrrrrrrr.",
            ".rrrrrryyrrrrrr.",
            "..rrrrryyrrrrr..",
            "..rrwrwrwrwrrr..",
            "...rrrrrrrrrr...",
            "..rr.rrrrrr.rr..",
            "..rr..rrrr..rr..",
            ".rrr..rrrr..rrr.",
            ".rr...rr.rr..rr.",
        ),
    )
}

data class HeroPalette(
    val hair: Color = Color(0xFF5A3A1A),
    val shirt: Color = Color(0xFF4FE3FF),
    val pants: Color = Color(0xFF3B3770),
    val shoe: Color = Color(0xFFF4F1FF),
) {
    fun toMap(): Map<Char, Color> = mapOf(
        'h' to hair, 's' to SKIN, 'a' to SKIN, 'k' to Color(0xFF14122B),
        'b' to shirt, 'p' to pants, 'w' to shoe,
    )

    companion object { private val SKIN = Color(0xFFFFCFA0) }
}

val BossPalette: Map<Char, Color> = mapOf(
    'r' to Color(0xFFFF4F4F), 'w' to Color.White, 'k' to Color(0xFF14122B), 'y' to Color(0xFFFFD24F),
)
