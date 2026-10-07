package com.hedgetheapp.taskchute.widget

import android.content.ComponentName
import android.content.pm.PackageManager
import android.view.View
import android.widget.Chronometer
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.RemoteViews
import android.widget.ImageView
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
        val boundaryReceiver = context.packageManager.getReceiverInfo(
            ComponentName(context, AndroidHomeWidgetBoundaryReceiver::class.java),
            PackageManager.GET_META_DATA,
        )
        val boundaryRestoreReceiver = context.packageManager.getReceiverInfo(
            ComponentName(context, AndroidHomeWidgetBoundaryRestoreReceiver::class.java),
            PackageManager.GET_META_DATA,
        )

        assertTrue(provider.exported)
        assertEquals(R.xml.taskchute_home_widget_info, provider.metaData?.getInt("android.appwidget.provider"))
        assertFalse(actionReceiver.exported)
        assertFalse(boundaryReceiver.exported)
        assertFalse(boundaryRestoreReceiver.exported)
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
        assertNotNull(inflated.get().findViewById<ImageView>(R.id.home_widget_elapsed_icon))
        assertNotNull(inflated.get().findViewById<Chronometer>(R.id.home_widget_remaining))
        assertNotNull(inflated.get().findViewById<View>(R.id.home_widget_remaining_row))
        assertNotNull(inflated.get().findViewById<Chronometer>(R.id.home_widget_overrun))
        assertNotNull(inflated.get().findViewById<View>(R.id.home_widget_overrun_row))
        assertNotNull(inflated.get().findViewById<ProgressBar>(R.id.home_widget_progress))
        assertNotNull(inflated.get().findViewById<ProgressBar>(R.id.home_widget_progress_overrun))
        assertNotNull(inflated.get().findViewById<View>(R.id.home_widget_complete_action))
        assertNotNull(inflated.get().findViewById<View>(R.id.home_widget_idle_start_action))
        assertTrue(inflated.get().findViewById<Chronometer>(R.id.home_widget_remaining).isCountDown)
    }

    @Test
    fun optimisticStartPatchShowsRunningAndRemovesLifecycleControls() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val inflated = AtomicReference<View>()
        val presentation = optimisticAndroidHomeWidgetStart("Tapped task", 123_456L)
        assertNotNull(presentation)

        instrumentation.runOnMainSync {
            inflated.set(AndroidHomeWidgetRenderer.optimisticViews(context, presentation!!)
                .apply(context, FrameLayout(context)))
        }

        val root = inflated.get()
        assertEquals(View.VISIBLE, root.findViewById<View>(R.id.home_widget_running_content).visibility)
        assertEquals(View.GONE, root.findViewById<View>(R.id.home_widget_idle_content).visibility)
        assertEquals("Tapped task", root.findViewById<android.widget.TextView>(R.id.home_widget_running_title).text)
        assertEquals(123_456L, root.findViewById<Chronometer>(R.id.home_widget_elapsed).base)
        assertEquals(View.GONE, root.findViewById<View>(R.id.home_widget_complete_action).visibility)
        assertEquals(View.GONE, root.findViewById<View>(R.id.home_widget_status).visibility)
    }

    @Test
    fun optimisticCompletePatchPromotesKnownNextWithoutStartAndSupportsEmptyState() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val withNext = AtomicReference<View>()
        val withoutNext = AtomicReference<View>()

        instrumentation.runOnMainSync {
            withNext.set(AndroidHomeWidgetRenderer.optimisticViews(
                context,
                optimisticAndroidHomeWidgetComplete(AndroidHomeWidgetDisplayTask("Next task", "10:30 · 25分")),
            ).apply(context, FrameLayout(context)))
            withoutNext.set(AndroidHomeWidgetRenderer.optimisticViews(
                context,
                optimisticAndroidHomeWidgetComplete(null),
            ).apply(context, FrameLayout(context)))
        }

        val promoted = withNext.get()
        assertEquals(View.GONE, promoted.findViewById<View>(R.id.home_widget_running_content).visibility)
        assertEquals(View.VISIBLE, promoted.findViewById<View>(R.id.home_widget_idle_content).visibility)
        assertEquals("Next task", promoted.findViewById<android.widget.TextView>(R.id.home_widget_idle_task_title).text)
        assertEquals(View.GONE, promoted.findViewById<View>(R.id.home_widget_idle_start_action).visibility)

        val empty = withoutNext.get()
        assertEquals(View.GONE, empty.findViewById<View>(R.id.home_widget_running_content).visibility)
        assertEquals(View.GONE, empty.findViewById<View>(R.id.home_widget_idle_task_row).visibility)
        assertEquals(View.VISIBLE, empty.findViewById<View>(R.id.home_widget_idle_empty).visibility)
    }
}
