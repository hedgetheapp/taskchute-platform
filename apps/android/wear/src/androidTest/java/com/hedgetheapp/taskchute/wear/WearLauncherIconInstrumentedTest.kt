package com.hedgetheapp.taskchute.wear

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WearLauncherIconInstrumentedTest {
    @Test
    fun packagedLauncherIconIsAvailableToWearLauncher() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val appInfo = context.packageManager.getApplicationInfo(context.packageName, 0)

        assertNotEquals(0, appInfo.icon)
        assertNotNull(context.getDrawable(appInfo.icon))
        assertNotNull(context.getDrawable(R.mipmap.ic_launcher_round))
    }
}
