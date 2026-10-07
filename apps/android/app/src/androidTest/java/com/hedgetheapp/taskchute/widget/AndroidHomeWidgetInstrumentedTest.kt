package com.hedgetheapp.taskchute.widget

import android.content.ComponentName
import android.content.pm.PackageManager
import android.view.View
import android.widget.Chronometer
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.RemoteViews
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.hedgetheapp.taskchute.R
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AndroidHomeWidgetInstrumentedTest {
    @Test
    fun providerIsRegisteredAndActionReceiverIsPrivate() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val provider = context.packageManager.getReceiverInfo(
            ComponentName(context, AndroidHomeWidgetProvider::class.java),
            PackageManager.GET_META_DATA,
        )
        val actionReceiver = context.packageManager.getReceiverInfo(
            ComponentName(context, AndroidHomeWidgetActionReceiver::class.java),
            PackageManager.GET_META_DATA,
        )

        assertTrue(provider.exported)
        assertEquals(R.xml.taskchute_home_widget_info, provider.metaData?.getInt("android.appwidget.provider"))
        assertFalse(actionReceiver.exported)
    }

    @Test
    fun remoteViewsInflateSupportedTimerAndProgressViews() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val inflated = AtomicReference<View>()

        instrumentation.runOnMainSync {
            inflated.set(RemoteViews(context.packageName, R.layout.taskchute_home_widget)
                .apply(context, FrameLayout(context)))
        }

        assertNotNull(inflated.get().findViewById<Chronometer>(R.id.home_widget_elapsed))
        assertNotNull(inflated.get().findViewById<ProgressBar>(R.id.home_widget_progress))
        assertNotNull(inflated.get().findViewById<View>(R.id.home_widget_complete_action))
        assertNotNull(inflated.get().findViewById<View>(R.id.home_widget_idle_start_action))
    }
}
