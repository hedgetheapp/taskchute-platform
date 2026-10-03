package com.hedgetheapp.taskchute.wear

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.wear.protolayout.expression.DynamicBuilders.DynamicInstant
import androidx.wear.protolayout.expression.DynamicBuilders.DynamicString
import androidx.wear.watchface.complications.data.DynamicComplicationText
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WearComplicationPayloadInstrumentedTest {
    @Test
    fun dynamicProgressTextUsesPlatformTimeAndStableEstimate() {
        val minutes = DynamicInstant.withSecondsPrecision(Instant.parse("2026-10-02T10:00:00Z"))
            .durationUntil(DynamicInstant.platformTimeWithSecondsPrecision()).toIntMinutes()
        val text = DynamicComplicationText(minutes.format().concat(DynamicString.constant("/60")), "0/60")
        assertNotNull(text.dynamicValue)
        assertEquals("0/60", text.fallbackValue.toString())
    }
}
