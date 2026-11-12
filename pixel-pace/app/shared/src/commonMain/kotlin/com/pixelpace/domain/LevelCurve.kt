package com.pixelpace.domain

/** Level curve — identical to `PP.xpNeeded` in the HTML demo (js/data.js). */
object LevelCurve {
    fun xpNeeded(level: Int): Int {
        require(level >= 1) { "level must be >= 1" }
        return 100 + (level - 1) * 60
    }
}
