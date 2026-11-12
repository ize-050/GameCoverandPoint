package com.pixelpace.ui

import com.pixelpace.ui.sprite.BossPalette
import com.pixelpace.ui.sprite.HeroPalette
import com.pixelpace.ui.sprite.Sprites
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SpritesTest {
    @Test fun heroFramesAreRectangular() = Sprites.heroFrames.forEach { s ->
        assertEquals(16, s.height)
        assertTrue(s.rows.all { it.length == 12 }, "every hero row must be 12 wide")
    }

    @Test fun bossIsSquare16() {
        assertEquals(16, Sprites.boss.height)
        assertTrue(Sprites.boss.rows.all { it.length == 16 })
    }

    @Test fun everyGlyphHasAColor() {
        val hero = HeroPalette().toMap().keys + '.'
        Sprites.heroFrames.flatMap { it.rows }.forEach { r -> r.forEach { assertTrue(it in hero, "hero glyph '$it' unmapped") } }
        val boss = BossPalette.keys + '.'
        Sprites.boss.rows.forEach { r -> r.forEach { assertTrue(it in boss, "boss glyph '$it' unmapped") } }
    }
}
