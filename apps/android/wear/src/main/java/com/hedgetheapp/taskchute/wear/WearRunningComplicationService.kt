package com.hedgetheapp.taskchute.wear

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import androidx.wear.protolayout.expression.DynamicBuilders.DynamicInstant
import androidx.wear.protolayout.expression.DynamicBuilders.DynamicString
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationText
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.CountUpTimeReference
import androidx.wear.watchface.complications.data.DynamicComplicationText
import androidx.wear.watchface.complications.data.GoalProgressComplicationData
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.NoDataComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.data.TimeDifferenceComplicationText
import androidx.wear.watchface.complications.data.TimeDifferenceStyle
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.temporal.ChronoUnit

class WearRunningComplicationService : SuspendingComplicationDataSourceService() {
    override fun getPreviewData(type: ComplicationType): ComplicationData? = when (type) {
        ComplicationType.GOAL_PROGRESS -> goalProgressData(
            elapsedSeconds = PREVIEW_ELAPSED_SECONDS,
            estimateSeconds = PREVIEW_ESTIMATE_SECONDS,
            startedAt = Instant.now().minusSeconds(PREVIEW_ELAPSED_SECONDS),
            fallbackText = "15/30",
            contentDescription = "TaskChute、経過 15分 / 見積 30分",
            taskTitle = "TaskChute",
        )
        ComplicationType.SHORT_TEXT -> shortTextData(
            text = plainText("待機"),
            description = "TaskChute、待機中",
            title = "TaskChute",
        )
        ComplicationType.LONG_TEXT -> longTextData(
            text = plainText("TaskChute 待機"),
            description = "TaskChute、待機中",
            title = "TaskChute",
        )
        else -> null
    }

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData {
        WearLatencyDiagnostics.mark("wear_complication_request_received")
        val presentation = withContext(Dispatchers.IO) { loadPresentation() }
        return when (wearComplicationPayloadKind(requestedType(request.complicationType), presentation)) {
            WearComplicationPayloadKind.NO_DATA -> NoDataComplicationData()
            WearComplicationPayloadKind.GOAL_PROGRESS -> {
                val running = presentation as WearComplicationPresentation.Running
                goalProgressData(
                    elapsedSeconds = running.elapsedSeconds,
                    estimateSeconds = requireNotNull(running.estimateSeconds),
                    startedAt = running.startedAt,
                    fallbackText = running.compactText,
                    contentDescription = running.contentDescription,
                    taskTitle = running.taskTitle,
                )
            }
            WearComplicationPayloadKind.TEXT -> textData(request.complicationType, presentation)
        }
    }

    private fun loadPresentation(): WearComplicationPresentation = try {
        val repository = WearHttpRepository(
            BuildConfig.TASKCHUTE_BASE_URL,
            WearEncryptedSessionStore(applicationContext),
            requestTimeoutMillis = REQUEST_TIMEOUT_MILLIS,
        )
        val auth = repository.restoreSession()
        if (auth == WearAuthResult.SignedIn) {
            wearComplicationPresentation(auth, repository.loadToday(), Instant.now())
        } else {
            wearComplicationPresentation(auth, now = Instant.now())
        }
    } catch (_: Exception) {
        WearComplicationPresentation.Unavailable
    }

    private fun textData(
        type: ComplicationType,
        presentation: WearComplicationPresentation,
    ): ComplicationData {
        val (text, title, description) = when (presentation) {
            is WearComplicationPresentation.Running -> {
                val progress = if (presentation.estimateSeconds == null) {
                    elapsedText(presentation.startedAt)
                } else {
                    progressText(presentation.startedAt, presentation.estimateSeconds, presentation.compactText)
                }
                Triple(progress, presentation.taskTitle, presentation.contentDescription)
            }
            else -> wearComplicationTextFallback(requestedType(type), presentation)!!.let {
                Triple(plainText(it.text), it.title, it.contentDescription)
            }
        }
        return when (type) {
            ComplicationType.SHORT_TEXT -> shortTextData(text, description, title)
            ComplicationType.LONG_TEXT -> longTextData(text, description, title)
            else -> NoDataComplicationData()
        }
    }

    private fun goalProgressData(
        elapsedSeconds: Long,
        estimateSeconds: Int,
        startedAt: Instant,
        fallbackText: String,
        contentDescription: String,
        taskTitle: String,
    ): GoalProgressComplicationData {
        val description = plainText(contentDescription)
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            GoalProgressComplicationData.Builder(
                DynamicInstant.withSecondsPrecision(startedAt)
                    .durationUntil(DynamicInstant.platformTimeWithSecondsPrecision())
                    .toIntSeconds()
                    .asFloat(),
                elapsedSeconds.toFloat(),
                estimateSeconds.toFloat(),
                description,
            )
        } else {
            GoalProgressComplicationData.Builder(
                elapsedSeconds.toFloat(),
                estimateSeconds.toFloat(),
                description,
            )
        }
        return builder
            .setText(progressText(startedAt, estimateSeconds, fallbackText))
            .setTitle(plainText(taskTitle))
            .setMonochromaticImage(monochromaticImage())
            .setTapAction(openWearAppIntent())
            .build()
    }

    private fun shortTextData(text: ComplicationText, description: String, title: String) =
        ShortTextComplicationData.Builder(text, plainText(description))
            .setTitle(plainText(title))
            .setMonochromaticImage(monochromaticImage())
            .setTapAction(openWearAppIntent())
            .build()

    private fun longTextData(text: ComplicationText, description: String, title: String) =
        LongTextComplicationData.Builder(text, plainText(description))
            .setTitle(plainText(title))
            .setMonochromaticImage(monochromaticImage())
            .setTapAction(openWearAppIntent())
            .build()

    private fun elapsedText(startedAt: Instant): ComplicationText =
        TimeDifferenceComplicationText.Builder(
            TimeDifferenceStyle.SHORT_SINGLE_UNIT,
            CountUpTimeReference(startedAt.truncatedTo(ChronoUnit.SECONDS)),
        ).setDisplayAsNow(false).build()

    private fun progressText(startedAt: Instant, estimateSeconds: Int, fallbackText: String): ComplicationText {
        val targetMinutes = wearEstimateMinutes(estimateSeconds)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val minutes = DynamicInstant.withSecondsPrecision(startedAt)
                .durationUntil(DynamicInstant.platformTimeWithSecondsPrecision())
                .toIntMinutes()
            val dynamic = minutes.format().concat(DynamicString.constant("/$targetMinutes"))
            return DynamicComplicationText(dynamic, fallbackText)
        }
        return TimeDifferenceComplicationText.Builder(
            TimeDifferenceStyle.SHORT_DUAL_UNIT,
            CountUpTimeReference(startedAt.truncatedTo(ChronoUnit.SECONDS)),
        ).setDisplayAsNow(false).setText("^1/$targetMinutes").build()
    }

    private fun plainText(text: String): ComplicationText = PlainComplicationText.Builder(text).build()

    private fun monochromaticImage() = MonochromaticImage.Builder(
        Icon.createWithResource(this, R.drawable.ic_taskchute_complication),
    ).build()

    private fun openWearAppIntent(): PendingIntent {
        val intent = Intent().setClassName(this, wearComplicationTapTargetClassName()).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        return PendingIntent.getActivity(
            this,
            TAP_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun requestedType(type: ComplicationType): WearComplicationRequestedType = when (type) {
        ComplicationType.GOAL_PROGRESS -> WearComplicationRequestedType.GOAL_PROGRESS
        ComplicationType.SHORT_TEXT -> WearComplicationRequestedType.SHORT_TEXT
        ComplicationType.LONG_TEXT -> WearComplicationRequestedType.LONG_TEXT
        else -> WearComplicationRequestedType.UNSUPPORTED
    }

    companion object {
        private const val REQUEST_TIMEOUT_MILLIS = 4_000
        private const val TAP_REQUEST_CODE = 158
        private const val PREVIEW_ELAPSED_SECONDS = 15L * 60L
        private const val PREVIEW_ESTIMATE_SECONDS = 30 * 60
    }
}

internal object WearComplicationRefreshRequester {
    fun request(context: Context) {
        runCatching {
            ComplicationDataSourceUpdateRequester.create(
                context,
                ComponentName(context, WearRunningComplicationService::class.java),
            ).requestUpdateAll()
            WearLatencyDiagnostics.mark("wear_complication_refresh_requested")
        }
    }
}
