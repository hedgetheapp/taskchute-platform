package com.hedgetheapp.taskchute.widget

import android.content.ComponentName
import android.content.res.Configuration
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.view.View
import android.widget.Chronometer
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.RemoteViews
import android.widget.ImageView
import android.view.ViewGroup
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.hedgetheapp.taskchute.R
import com.hedgetheapp.taskchute.today.LifecycleState
import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.TodayExecution
import com.hedgetheapp.taskchute.today.TodayMode
import com.hedgetheapp.taskchute.today.TodayProject
import com.hedgetheapp.taskchute.today.TodaySection
import com.hedgetheapp.taskchute.today.TodayTask
import java.time.Instant
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.abs
import kotlin.math.roundToInt
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
    fun providerRequestsFourByTwoCellsAndKeepsLegacyMinimumDimensions() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val parser = context.resources.getXml(R.xml.taskchute_home_widget_info)
        val androidNamespace = "http://schemas.android.com/apk/res/android"
        try {
            while (parser.eventType != org.xmlpull.v1.XmlPullParser.START_TAG &&
                parser.next() != org.xmlpull.v1.XmlPullParser.END_DOCUMENT
            ) {
                // Advance to appwidget-provider.
            }
            assertEquals("appwidget-provider", parser.name)
            assertEquals(4, parser.getAttributeIntValue(androidNamespace, "targetCellWidth", 0))
            assertEquals(2, parser.getAttributeIntValue(androidNamespace, "targetCellHeight", 0))
            assertEquals(
                280,
                parser.getAttributeValue(androidNamespace, "minWidth")!!
                    .removeSuffix("dip")
                    .removeSuffix("dp")
                    .toFloat()
                    .roundToInt(),
            )
            assertEquals(
                200,
                parser.getAttributeValue(androidNamespace, "minHeight")!!
                    .removeSuffix("dip")
                    .removeSuffix("dp")
                    .toFloat()
                    .roundToInt(),
            )
        } finally {
            parser.close()
        }
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
    fun optimisticStartPatchShowsRunningWithDisabledCompleteControl() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val inflated = AtomicReference<View>()
        val presentation = optimisticAndroidHomeWidgetStart(
            "Tapped task",
            123_456L,
            AndroidHomeWidgetDisplayTask("Next task", "10:30 · 25分"),
        )
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
        assertEquals(View.VISIBLE, root.findViewById<View>(R.id.home_widget_running_next_label).visibility)
        assertEquals(
            "Next task",
            root.findViewById<android.widget.TextView>(R.id.home_widget_running_next_title).text,
        )
        val pendingComplete = root.findViewById<View>(R.id.home_widget_complete_action)
        assertEquals(View.VISIBLE, pendingComplete.visibility)
        assertFalse(pendingComplete.isEnabled)
        assertFalse(pendingComplete.hasOnClickListeners())
        assertFalse(pendingComplete.performClick())
        assertEquals(
            context.getString(R.string.home_widget_complete_pending_action),
            pendingComplete.contentDescription,
        )
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
                optimisticAndroidHomeWidgetComplete(
                    AndroidHomeWidgetDisplayTask("Next task", "10:30 · 25分"),
                    AndroidHomeWidgetDisplayTask("Following task", null),
                ),
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
        assertEquals(View.VISIBLE, promoted.findViewById<View>(R.id.home_widget_idle_following_row).visibility)
        assertEquals(
            "Following task",
            promoted.findViewById<android.widget.TextView>(R.id.home_widget_idle_following_title).text,
        )
        val pendingStart = promoted.findViewById<View>(R.id.home_widget_idle_start_action)
        assertEquals(View.VISIBLE, pendingStart.visibility)
        assertFalse(pendingStart.isEnabled)
        assertFalse(pendingStart.hasOnClickListeners())
        assertFalse(pendingStart.performClick())
        assertEquals(
            context.getString(R.string.home_widget_start_pending_action),
            pendingStart.contentDescription,
        )
        val pendingIcon = promoted.findViewById<ImageView>(R.id.home_widget_idle_start_icon)
        assertNotNull(pendingIcon.imageTintList)
        assertFalse(pendingIcon.isEnabled)
        assertEquals(View.VISIBLE, pendingIcon.visibility)

        val empty = withoutNext.get()
        assertEquals(View.GONE, empty.findViewById<View>(R.id.home_widget_running_content).visibility)
        assertEquals(View.GONE, empty.findViewById<View>(R.id.home_widget_idle_task_row).visibility)
        assertEquals(View.VISIBLE, empty.findViewById<View>(R.id.home_widget_idle_empty).visibility)
        assertEquals(View.GONE, empty.findViewById<View>(R.id.home_widget_idle_following_row).visibility)
    }

    @Test
    fun optimisticStartReappliedCanonicalRunningRestoresCompleteAction() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val presentation = optimisticAndroidHomeWidgetStart("Running task", 123_456L)!!
        val canonical = AndroidHomeWidgetRenderer.contentViews(context, 177, canonicalRunningState("execution"))
        val root = applyAndReapply(
            context,
            AndroidHomeWidgetRenderer.optimisticViews(context, presentation),
            canonical,
        )
        val complete = root.findViewById<View>(R.id.home_widget_complete_action)
        val stopIcon = root.findViewById<View>(R.id.home_widget_stop_icon)

        assertEquals(View.VISIBLE, complete.visibility)
        assertTrue(complete.isEnabled)
        assertTrue(complete.hasOnClickListeners())
        assertTrue(stopIcon.isEnabled)
        assertEquals(context.getString(R.string.home_widget_complete_action), complete.contentDescription)

        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            canonical.reapply(context, root)
        }

        assertEquals(View.VISIBLE, complete.visibility)
        assertTrue(complete.isEnabled)
        assertTrue(complete.hasOnClickListeners())
        assertTrue(stopIcon.isEnabled)
    }

    @Test
    fun optimisticCompleteReappliedCanonicalIdleRestoresStartAction() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val widget = attachMeasured(
            context,
            AndroidHomeWidgetRenderer.contentViews(context, 178, canonicalIdleState(withNext = true)),
            widthDp = 280,
            heightDp = 260,
        )
        val start = widget.root.findViewById<View>(R.id.home_widget_idle_start_action)
        val canonicalBounds = Rect(start.left, start.top, start.right, start.bottom)
        val optimistic = AndroidHomeWidgetRenderer.optimisticViews(
            context,
            optimisticAndroidHomeWidgetComplete(AndroidHomeWidgetDisplayTask("Next task", "10:30 · 25分")),
        )

        optimistic.reapply(context, widget.root)
        layout(widget)
        assertEquals(canonicalBounds, Rect(start.left, start.top, start.right, start.bottom))
        assertEquals(View.VISIBLE, start.visibility)
        assertFalse(start.isEnabled)
        assertFalse(start.hasOnClickListeners())
        assertFalse(start.performClick())
        assertEquals(
            context.getString(R.string.home_widget_start_pending_action),
            start.contentDescription,
        )

        optimistic.reapply(context, widget.root)
        layout(widget)
        assertFalse(start.isEnabled)
        assertFalse(start.hasOnClickListeners())
        assertEquals(canonicalBounds, Rect(start.left, start.top, start.right, start.bottom))

        AndroidHomeWidgetRenderer.contentViews(context, 178, canonicalIdleState(withNext = true))
            .reapply(context, widget.root)
        layout(widget)

        assertEquals(View.VISIBLE, start.visibility)
        assertTrue(start.isEnabled)
        assertTrue(start.hasOnClickListeners())
        assertEquals(context.getString(R.string.home_widget_start_action), start.contentDescription)
        assertEquals(canonicalBounds, Rect(start.left, start.top, start.right, start.bottom))
    }

    @Test
    fun optimisticCompleteRevertedToRunningClearsPromotedStartAction() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val widget = attachMeasured(
            context,
            AndroidHomeWidgetRenderer.contentViews(context, 184, canonicalIdleState(withNext = true)),
            widthDp = 280,
            heightDp = 260,
        )
        AndroidHomeWidgetRenderer.optimisticViews(
            context,
            optimisticAndroidHomeWidgetComplete(AndroidHomeWidgetDisplayTask("Next task", null)),
        ).reapply(context, widget.root)
        layout(widget)
        val pendingStart = widget.root.findViewById<View>(R.id.home_widget_idle_start_action)
        assertFalse(pendingStart.isEnabled)
        assertFalse(pendingStart.hasOnClickListeners())

        AndroidHomeWidgetRenderer.contentViews(context, 184, canonicalRunningState("execution"))
            .reapply(context, widget.root)
        layout(widget)

        assertEquals(View.GONE, pendingStart.visibility)
        assertFalse(pendingStart.hasOnClickListeners())
        assertEquals(
            View.VISIBLE,
            widget.root.findViewById<View>(R.id.home_widget_complete_action).visibility,
        )
    }

    @Test
    fun canonicalTwoSlotLabelsAndActionsKeepSecondaryPreviewNonActionable() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val idle = AndroidHomeWidgetRenderer.contentViews(
            context,
            185,
            canonicalIdleState(withNext = true),
        ).apply(context, FrameLayout(context))

        assertEquals(
            context.getString(R.string.home_widget_next_label),
            idle.findViewById<android.widget.TextView>(R.id.home_widget_idle_label).text,
        )
        assertEquals(View.VISIBLE, idle.findViewById<View>(R.id.home_widget_idle_following_row).visibility)
        assertEquals(
            context.getString(R.string.home_widget_preview_description, "Following task"),
            idle.findViewById<View>(R.id.home_widget_idle_following_row).contentDescription,
        )
        assertTrue(idle.findViewById<View>(R.id.home_widget_idle_start_action).hasOnClickListeners())
        assertFalse(idle.findViewById<View>(R.id.home_widget_idle_following_row).hasOnClickListeners())
        assertNoRedundantOrdinalCopy(idle)

        val running = AndroidHomeWidgetRenderer.contentViews(
            context,
            186,
            canonicalRunningState("execution"),
        ).apply(context, FrameLayout(context))
        assertEquals(
            context.getString(R.string.home_widget_running_label),
            running.findViewById<android.widget.TextView>(R.id.home_widget_running_label).text,
        )
        assertEquals(
            context.getString(R.string.home_widget_next_label),
            running.findViewById<android.widget.TextView>(R.id.home_widget_running_next_label).text,
        )
        assertEquals(
            "Next task",
            running.findViewById<android.widget.TextView>(R.id.home_widget_running_next_title).text,
        )
        assertEquals(
            context.getString(R.string.home_widget_preview_description, "Next task"),
            running.findViewById<View>(R.id.home_widget_running_next_row).contentDescription,
        )
        assertFalse(running.findViewById<View>(R.id.home_widget_running_next_row).hasOnClickListeners())
        assertTrue(running.findViewById<View>(R.id.home_widget_complete_action).hasOnClickListeners())
        assertNoRedundantOrdinalCopy(running)
    }

    @Test
    fun canonicalRunningWithoutExecutionHidesAndClearsPreviouslyBoundCompleteAction() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val root = applyAndReapply(
            context,
            AndroidHomeWidgetRenderer.contentViews(context, 179, canonicalRunningState("execution")),
            AndroidHomeWidgetRenderer.contentViews(context, 179, canonicalRunningState(executionId = null)),
        )
        val complete = root.findViewById<View>(R.id.home_widget_complete_action)
        val stopIcon = root.findViewById<View>(R.id.home_widget_stop_icon)

        assertEquals(View.GONE, complete.visibility)
        assertFalse(complete.isEnabled)
        assertFalse(complete.hasOnClickListeners())
        assertFalse(complete.performClick())
        assertFalse(stopIcon.isEnabled)
    }

    @Test
    fun invalidCanonicalStateHidesAndDisablesPreviouslyPendingCompleteAction() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val invalidState = AndroidHomeWidgetState.Content(
            day = canonicalRunningState("execution").day,
            projection = AndroidHomeWidgetProjection.InvalidActiveState,
        )
        val root = applyAndReapply(
            context,
            AndroidHomeWidgetRenderer.optimisticViews(
                context,
                optimisticAndroidHomeWidgetStart("Running task", 123_456L)!!,
            ),
            AndroidHomeWidgetRenderer.contentViews(context, 181, invalidState),
        )
        val complete = root.findViewById<View>(R.id.home_widget_complete_action)
        val stopIcon = root.findViewById<View>(R.id.home_widget_stop_icon)

        assertEquals(View.VISIBLE, root.findViewById<View>(R.id.home_widget_status).visibility)
        assertEquals(View.GONE, root.findViewById<View>(R.id.home_widget_running_content).visibility)
        assertEquals(View.GONE, complete.visibility)
        assertFalse(complete.isEnabled)
        assertFalse(complete.hasOnClickListeners())
        assertFalse(complete.performClick())
        assertFalse(stopIcon.isEnabled)
    }

    @Test
    fun canonicalIdleWithoutNextTaskHidesAndClearsPreviouslyBoundStartAction() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val root = applyAndReapply(
            context,
            AndroidHomeWidgetRenderer.contentViews(context, 180, canonicalIdleState(withNext = true)),
            AndroidHomeWidgetRenderer.contentViews(context, 180, canonicalIdleState(withNext = false)),
        )
        val start = root.findViewById<View>(R.id.home_widget_idle_start_action)

        assertEquals(View.GONE, start.visibility)
        assertFalse(start.hasOnClickListeners())
    }

    @Test
    fun visibleSurfaceTracksHostBoundsAcrossLifecycleStates() {
        val baseContext = InstrumentationRegistry.getInstrumentation().targetContext
        val scenarios = listOf(
            Triple(1.0f, 280, 200),
            Triple(1.0f, 280, 220),
            Triple(1.0f, 280, 240),
            Triple(1.3f, 280, 200),
            Triple(1.3f, 280, 220),
            Triple(1.3f, 280, 240),
            Triple(1.0f, 240, 200),
            Triple(1.3f, 240, 220),
        )
        val longTitle = "A very long running task title that should truncate without covering actions"

        scenarios.forEachIndexed { index, (fontScale, widthDp, heightDp) ->
            val configuration = Configuration(baseContext.resources.configuration).apply {
                this.fontScale = fontScale
            }
            val context = baseContext.createConfigurationContext(configuration)
            val views = listOf(
                AndroidHomeWidgetRenderer.contentViews(
                    context,
                    190 + index,
                    canonicalRunningState("execution", title = longTitle),
                ),
                AndroidHomeWidgetRenderer.contentViews(
                    context,
                    190 + index,
                    canonicalRunningState("execution", startedAt = "2026-10-07T09:00:00Z"),
                ),
                AndroidHomeWidgetRenderer.contentViews(
                    context,
                    190 + index,
                    canonicalRunningState("execution", startedAt = "2026-10-07T08:30:00Z"),
                ),
                AndroidHomeWidgetRenderer.contentViews(
                    context,
                    190 + index,
                    canonicalRunningState("execution", estimateSeconds = null),
                ),
                AndroidHomeWidgetRenderer.contentViews(
                    context,
                    190 + index,
                    canonicalRunningState("execution").copy(
                        notice = "操作を完了できませんでした。最新の状態を表示しています。",
                    ),
                ),
                AndroidHomeWidgetRenderer.optimisticViews(
                    context,
                    optimisticAndroidHomeWidgetStart(
                        "Running task",
                        123_456L,
                        AndroidHomeWidgetDisplayTask("Next task", "10:30 · 25分"),
                    )!!,
                ),
                AndroidHomeWidgetRenderer.optimisticViews(
                    context,
                    optimisticAndroidHomeWidgetComplete(
                        AndroidHomeWidgetDisplayTask("Next task", "10:30 · 25分"),
                        AndroidHomeWidgetDisplayTask("Following task", null),
                    ),
                ),
                AndroidHomeWidgetRenderer.contentViews(
                    context,
                    190 + index,
                    canonicalIdleState(withNext = true, title = longTitle),
                ),
                AndroidHomeWidgetRenderer.contentViews(context, 190 + index, canonicalIdleState(withNext = false)),
                RemoteViews(context.packageName, R.layout.taskchute_home_widget).apply {
                    setViewVisibility(R.id.home_widget_running_content, View.GONE)
                    setViewVisibility(R.id.home_widget_idle_content, View.GONE)
                    setViewVisibility(R.id.home_widget_status, View.VISIBLE)
                    setTextViewText(R.id.home_widget_status, "サインインが必要です")
                },
            )
            val widget = attachMeasured(context, views.first(), widthDp = widthDp, heightDp = heightDp)
            val density = context.resources.displayMetrics.density
            val expectedWidth = (widthDp * density).roundToInt()
            val expectedHeight = (heightDp * density).roundToInt()
            val contentContainer = widget.root.findViewById<LinearLayout>(R.id.home_widget_surface_content)
            val surfaceBitmap = Bitmap.createBitmap(expectedWidth, expectedHeight, Bitmap.Config.ARGB_8888)
            val surfaceCanvas = Canvas(surfaceBitmap)

            views.forEachIndexed { stateIndex, remoteViews ->
                if (stateIndex > 0) {
                    remoteViews.reapply(context, widget.root)
                    layout(widget)
                }
                assertEquals("root width at fontScale=$fontScale state=$stateIndex", expectedWidth, widget.root.width)
                assertEquals("root height at fontScale=$fontScale state=$stateIndex", expectedHeight, widget.root.height)
                assertEquals("content frame width at fontScale=$fontScale state=$stateIndex", expectedWidth, contentContainer.width)
                assertEquals("content frame height at fontScale=$fontScale state=$stateIndex", expectedHeight, contentContainer.height)
                assertEquals("content frame must start at the top of the launcher allocation", 0, contentContainer.top)
                // A View applies background drawable bounds during drawing, not measurement.
                widget.root.draw(surfaceCanvas)
                val surfaceBounds = widget.root.background.bounds
                assertEquals("surface width at fontScale=$fontScale state=$stateIndex", expectedWidth, surfaceBounds.width())
                assertEquals("surface height at fontScale=$fontScale state=$stateIndex", expectedHeight, surfaceBounds.height())
                assertEquals("surface must reach the launcher allocation bottom", expectedHeight, surfaceBounds.bottom)
                val expectedBackground = context.getColor(R.color.home_widget_background)
                assertEquals(expectedBackground, surfaceBitmap.getPixel(expectedWidth / 2, 0))
                assertEquals(expectedBackground, surfaceBitmap.getPixel(expectedWidth / 2, expectedHeight - 1))
                assertVisibleContentBalanced(
                    widget.root as ViewGroup,
                    contentContainer,
                    surfaceBounds,
                    density,
                    "fontScale=$fontScale height=$heightDp state=$stateIndex",
                )

                val runningContent = widget.root.findViewById<View>(R.id.home_widget_running_content)
                if (runningContent.visibility == View.VISIBLE) {
                    assertTrue(
                        "Running content must fit without clipping at fontScale=$fontScale height=$heightDp state=$stateIndex",
                        runningContent.bottom <= surfaceBounds.bottom - contentContainer.paddingBottom,
                    )
                    assertTrue(widget.root.findViewById<View>(R.id.home_widget_running_title).width > 0)
                    val complete = widget.root.findViewById<View>(R.id.home_widget_complete_action)
                    assertEquals((48f * density).roundToInt(), complete.width)
                    assertEquals((48f * density).roundToInt(), complete.height)
                    val runningCard = widget.root.findViewById<View>(R.id.home_widget_running_card)
                    assertEquals(
                        runningCard.top + runningCard.height / 2,
                        runningCard.top + complete.top + complete.height / 2,
                    )
                    val nextRow = widget.root.findViewById<View>(R.id.home_widget_running_next_row)
                    val nextBounds = Rect(0, 0, nextRow.width, nextRow.height)
                    widget.root.offsetDescendantRectToMyCoords(
                        nextRow,
                        nextBounds,
                    )
                    assertTrue(
                        "next preview must fit at fontScale=$fontScale height=$heightDp state=$stateIndex " +
                            "(next=$nextBounds surface=$surfaceBounds paddingBottom=${contentContainer.paddingBottom})",
                        nextBounds.bottom <= surfaceBounds.bottom - contentContainer.paddingBottom,
                    )
                }

                val idleRow = widget.root.findViewById<View>(R.id.home_widget_idle_task_row)
                val idleContent = widget.root.findViewById<View>(R.id.home_widget_idle_content)
                if (idleContent.visibility == View.VISIBLE) {
                    assertTrue("Idle content must fit within the host-aligned surface", idleContent.bottom <= surfaceBounds.bottom)
                }
                if (idleContent.visibility == View.VISIBLE && idleRow.visibility == View.VISIBLE) {
                    val title = widget.root.findViewById<View>(R.id.home_widget_idle_task_title)
                    val action = widget.root.findViewById<View>(R.id.home_widget_idle_start_action)
                    assertTrue(title.width > 0)
                    assertTrue("Idle title and action must not overlap", title.right <= action.left)
                    assertEquals((48f * density).roundToInt(), action.width)
                    assertEquals((48f * density).roundToInt(), action.height)
                    val followingRow = widget.root.findViewById<View>(R.id.home_widget_idle_following_row)
                    assertEquals(View.VISIBLE, followingRow.visibility)
                    assertTrue("Second preview follows the primary task", followingRow.top >= idleRow.bottom)
                    val followingTitle = widget.root.findViewById<View>(R.id.home_widget_idle_following_title)
                    assertTrue("Second preview title must remain in bounds", followingTitle.right <= followingRow.right)
                }

                val status = widget.root.findViewById<View>(R.id.home_widget_status)
                if (status.visibility == View.VISIBLE) {
                    assertTrue("status text must fit its minimum row", status.height >= (64f * density).roundToInt())
                    assertTrue("status must remain within the host-aligned surface", status.bottom <= surfaceBounds.bottom)
                }
            }
        }
    }

    private fun assertVisibleContentBalanced(
        root: ViewGroup,
        contentContainer: LinearLayout,
        surfaceBounds: Rect,
        density: Float,
        label: String,
    ) {
        val visibleChildren = (0 until contentContainer.childCount)
            .map(contentContainer::getChildAt)
            .filter { it.visibility == View.VISIBLE }
        assertTrue("$label must have a visible content group", visibleChildren.isNotEmpty())

        val childBounds = visibleChildren.map { child ->
            Rect(0, 0, child.width, child.height).also { root.offsetDescendantRectToMyCoords(child, it) }
        }
        val childSummary = visibleChildren.zip(childBounds).joinToString { (child, bounds) ->
            "id=${child.id} top=${bounds.top} bottom=${bounds.bottom} measured=${child.measuredHeight} layout=${child.top}..${child.bottom}"
        }
        val topGap = childBounds.minOf { it.top } - surfaceBounds.top
        val bottomGap = surfaceBounds.bottom - childBounds.maxOf { it.bottom }
        assertTrue("$label content must stay inside the host-aligned frame", topGap >= 0 && bottomGap >= 0)
        assertTrue(
            "$label content should be vertically balanced (top=$topGap, bottom=$bottomGap, surface=$surfaceBounds, children=$childSummary)",
            abs(topGap - bottomGap) <= (8f * density).roundToInt(),
        )
    }

    private data class MeasuredWidget(
        val host: FrameLayout,
        val root: View,
        val widthPx: Int,
        val heightPx: Int,
    )

    private fun attachMeasured(context: android.content.Context, views: RemoteViews, widthDp: Int, heightDp: Int): MeasuredWidget {
        val host = FrameLayout(context)
        val root = views.apply(context, host)
        host.addView(root)
        val widthPx = (widthDp * context.resources.displayMetrics.density).roundToInt()
        val heightPx = (heightDp * context.resources.displayMetrics.density).roundToInt()
        val widget = MeasuredWidget(host, root, widthPx, heightPx)
        layout(widget)
        return widget
    }

    private fun layout(widget: MeasuredWidget) {
        widget.host.measure(
            View.MeasureSpec.makeMeasureSpec(widget.widthPx, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(widget.heightPx, View.MeasureSpec.EXACTLY),
        )
        widget.host.layout(0, 0, widget.widthPx, widget.heightPx)
    }

    private fun applyAndReapply(context: android.content.Context, first: RemoteViews, next: RemoteViews): View {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val result = AtomicReference<View>()
        instrumentation.runOnMainSync {
            val root = first.apply(context, FrameLayout(context))
            next.reapply(context, root)
            result.set(root)
        }
        return result.get()
    }

    private fun canonicalRunningState(
        executionId: String?,
        title: String = "Running task",
        startedAt: String = "2026-10-07T09:50:00Z",
        estimateSeconds: Int? = 1800,
    ): AndroidHomeWidgetState.Content {
        val task = widgetTask("running", LifecycleState.RUNNING, executionId, title, estimateSeconds)
        val execution = executionId?.let { TodayExecution(it, task.id, startedAt, estimateSeconds) }
        val planned = if (execution == null) {
            emptyList()
        } else {
            listOf(
                widgetTask("next", LifecycleState.PLANNED, title = "Next task"),
                widgetTask("following", LifecycleState.PLANNED, title = "Following task"),
            )
        }
        val day = widgetDay(listOf(task) + planned, execution)
        val projection = if (execution == null) {
            AndroidHomeWidgetProjection.Running(
                task = task,
                nextPlanned = null,
                startedAt = startedAt,
                elapsedSeconds = 600,
                remainingSeconds = null,
                overrunSeconds = null,
                estimateSeconds = null,
                progressPermille = null,
            )
        } else {
            projectAndroidHomeWidget(day, Instant.parse("2026-10-07T10:00:00Z")) as AndroidHomeWidgetProjection.Running
        }
        return AndroidHomeWidgetState.Content(day, projection)
    }

    private fun canonicalIdleState(withNext: Boolean, title: String = "Next task"): AndroidHomeWidgetState.Content {
        val tasks = if (withNext) {
            listOf(
                widgetTask("next", LifecycleState.PLANNED, title = title),
                widgetTask("following", LifecycleState.PLANNED, title = "Following task"),
            )
        } else {
            emptyList()
        }
        val day = widgetDay(tasks, execution = null)
        val projection = projectAndroidHomeWidget(day, Instant.parse("2026-10-07T10:00:00Z")) as AndroidHomeWidgetProjection.Idle
        return AndroidHomeWidgetState.Content(day, projection)
    }

    private fun assertNoRedundantOrdinalCopy(root: View) {
        fun visit(view: View) {
            val text = (view as? android.widget.TextView)?.text?.toString().orEmpty()
            val description = view.contentDescription?.toString().orEmpty()
            assertFalse(text.contains("次の次のタスク") || text.contains("その次のタスク"))
            assertFalse(description.contains("次の次のタスク") || description.contains("その次のタスク"))
            if (view is ViewGroup) {
                repeat(view.childCount) { index -> visit(view.getChildAt(index)) }
            }
        }
        visit(root)
    }

    private fun widgetDay(tasks: List<TodayTask>, execution: TodayExecution?): TodayDay = TodayDay(
        logicalDate = "2026-10-07",
        isCurrent = true,
        planningEnabled = true,
        placementRevision = 1,
        sections = listOf(TodaySection("section", "Section", 0, 1440, tasks)),
        unsectionedEntries = emptyList(),
        activeExecution = execution,
        taskChuteDayId = "day-id",
    )

    private fun widgetTask(
        id: String,
        state: LifecycleState,
        executionId: String? = null,
        title: String = id.replaceFirstChar(Char::uppercase),
        estimateSeconds: Int? = 1800,
    ) = TodayTask(
        id = id,
        title = title,
        lifecycleState = state,
        project = TodayProject("project", "Project"),
        mode = TodayMode("mode", "Mode"),
        estimateSeconds = estimateSeconds,
        plannedStartMinute = null,
        executionId = executionId,
        activeStartedAt = executionId?.let { "2026-10-07T09:50:00Z" },
    )
}

