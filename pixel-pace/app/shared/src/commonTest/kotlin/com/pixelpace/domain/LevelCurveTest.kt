package com.pixelpace.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class LevelCurveTest {
    @Test fun levelOneNeedsHundred() = assertEquals(100, LevelCurve.xpNeeded(1))
    @Test fun levelFourMatchesDemo() = assertEquals(280, LevelCurve.xpNeeded(4))
    @Test fun rejectsInvalidLevel() { assertFailsWith<IllegalArgumentException> { LevelCurve.xpNeeded(0) } }
}
