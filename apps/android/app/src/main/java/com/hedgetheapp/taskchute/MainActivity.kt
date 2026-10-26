package com.hedgetheapp.taskchute

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.lifecycleScope
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.hedgetheapp.taskchute.auth.AuthUiState
import com.hedgetheapp.taskchute.auth.PhoneWearPairingController
import com.hedgetheapp.taskchute.realtime.AndroidRealtimeScheduler
import com.hedgetheapp.taskchute.realtime.OkHttpRealtimeSocketFactory
import com.hedgetheapp.taskchute.realtime.RealtimeAuthProbe
import com.hedgetheapp.taskchute.realtime.RealtimeConnectionCallbacks
import com.hedgetheapp.taskchute.realtime.RealtimeConnectionManager
import okhttp3.OkHttpClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import com.hedgetheapp.taskchute.today.TodayController
import com.hedgetheapp.taskchute.today.TodayHttpRepository
import com.hedgetheapp.taskchute.today.TodayHttpResponse
import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.shouldExposeTodayDiagnostic
import com.hedgetheapp.taskchute.today.TodayScreen
import com.hedgetheapp.taskchute.today.TaskPlanningController
import com.hedgetheapp.taskchute.today.TaskPlanningHttpRepository
import com.hedgetheapp.taskchute.ui.AndroidDestination
import com.hedgetheapp.taskchute.ui.AuthScreenPresentation
import com.hedgetheapp.taskchute.ui.FullScreenLoadingPresentation
import com.hedgetheapp.taskchute.ui.TaskChuteTheme
import com.hedgetheapp.taskchute.ui.authScreenPresentation
import com.hedgetheapp.taskchute.document.DailyController
import com.hedgetheapp.taskchute.document.DailySaveStatus
import com.hedgetheapp.taskchute.document.DailyResult
import com.hedgetheapp.taskchute.document.DailyDocumentHttpRepository
import com.hedgetheapp.taskchute.document.DailyScreen
import com.hedgetheapp.taskchute.document.AndroidDailyDocument
import com.hedgetheapp.taskchute.document.AndroidDocument
import com.hedgetheapp.taskchute.document.AndroidInternalDocumentRoute
import com.hedgetheapp.taskchute.document.DocumentResult
import com.hedgetheapp.taskchute.document.NoteSaveStatus
import com.hedgetheapp.taskchute.document.DocumentHttpRepository
import com.hedgetheapp.taskchute.document.NotesController
import com.hedgetheapp.taskchute.document.NotesScreen
import com.hedgetheapp.taskchute.today.TodayDirectManipulationController
import com.hedgetheapp.taskchute.today.TodayDirectManipulationHttpRepository
import com.hedgetheapp.taskchute.settings.SettingsController
import com.hedgetheapp.taskchute.settings.SettingsHttpRepository
import com.hedgetheapp.taskchute.settings.SettingsScreen
import com.hedgetheapp.taskchute.reminders.TaskReminderScheduler
import com.hedgetheapp.taskchute.widget.AndroidHomeWidgetIntents
import com.hedgetheapp.taskchute.review.ReviewScreen
import com.hedgetheapp.taskchute.review.ReviewDailyMetricsController
import com.hedgetheapp.taskchute.review.ReviewPeriodMetricsController
import com.hedgetheapp.taskchute.review.ReviewPeriodMetricsHttpRepository

private sealed interface InternalLinkSource {
    data class Note(val documentId: String, val returnDestination: AndroidDestination) : InternalLinkSource
    data class Daily(val logicalDate: String) : InternalLinkSource
}

class MainActivity : ComponentActivity() {
    private lateinit var controller: AuthController
    private lateinit var todayController: TodayController
    private lateinit var realtimeManager: RealtimeConnectionManager
    private lateinit var realtimeHttpClient: OkHttpClient
    private lateinit var planningController: TaskPlanningController
    private lateinit var directManipulationController: TodayDirectManipulationController
    private lateinit var notesController: NotesController
    private lateinit var settingsController: SettingsController
    private lateinit var dailyController: DailyController
    private lateinit var wearPairingController: PhoneWearPairingController
    private lateinit var taskReminderScheduler: TaskReminderScheduler
    private lateinit var reviewDailyMetricsController: ReviewDailyMetricsController
    private lateinit var reviewPeriodMetricsController: ReviewPeriodMetricsController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        controller = AuthController(this, BuildConfig.TASKCHUTE_BASE_URL)
        taskReminderScheduler = TaskReminderScheduler(this)
        wearPairingController = PhoneWearPairingController(
            context = this,
            request = { method, path, body ->
                controller.authenticatedRequest(method, path, body)?.let { TodayHttpResponse(it.status, it.body) }
            },
            onUnauthorized = controller::restore,
        )
        val todayRepository = TodayHttpRepository(
            request = { method, path, body -> controller.authenticatedRequest(method, path, body)?.let { TodayHttpResponse(it.status, it.body) } },
            onUnauthorized = {},
            diagnosticsEnabled = shouldExposeTodayDiagnostic(BuildConfig.DEBUG, BuildConfig.TASKCHUTE_BASE_URL),
        )
        val onCanonicalDayLoaded: (TodayDay) -> Unit = { day ->
            taskReminderScheduler.reconcile(day)
            if (day.isCurrent) AndroidHomeWidgetIntents.requestRefresh(applicationContext)
        }
        reviewDailyMetricsController = ReviewDailyMetricsController(
            loadDay = todayRepository::loadDay,
            onUnauthorized = controller::restore,
            onCanonicalCurrentDayLoaded = onCanonicalDayLoaded,
        )
        reviewPeriodMetricsController = ReviewPeriodMetricsController(
            loadMetrics = ReviewPeriodMetricsHttpRepository(
                request = { method, path, body -> controller.authenticatedRequest(method, path, body)?.let { TodayHttpResponse(it.status, it.body) } },
            )::load,
            onUnauthorized = controller::restore,
        )
        todayController = TodayController(
            repository = todayRepository,
            onUnauthorized = controller::restore,
            onCanonicalDayLoaded = onCanonicalDayLoaded,
        )
        planningController = TaskPlanningController(
            repository = TaskPlanningHttpRepository { method, path, body -> controller.authenticatedRequest(method, path, body)?.let { TodayHttpResponse(it.status, it.body) } },
            onUnauthorized = controller::restore,
            onSaved = todayController::reconcileSilently,
            onPlacementRevisionConfirmed = todayController::confirmPlacementRevision,
            onOptimisticIntent = todayController::applyOptimisticPlanning,
            latestDay = { todayController.state.day },
            onOptimisticFailure = { todayController.clearOptimisticPresentation(); todayController.reconcileSilently() },
        )
        directManipulationController = TodayDirectManipulationController(
            repository = TodayDirectManipulationHttpRepository(
                request = { method, path, body -> controller.authenticatedRequest(method, path, body)?.let { TodayHttpResponse(it.status, it.body) } },
                onUnauthorized = controller::restore,
            ),
            onRefresh = todayController::reconcileSilently,
            onUnauthorized = controller::restore,
            onOptimisticIntent = todayController::applyOptimisticDirectManipulation,
            onOptimisticFailure = todayController::clearOptimisticPresentation,
            loadDay = todayRepository::loadDay,
            onPlacementRevisionConfirmed = todayController::confirmPlacementRevision,
        )
        notesController = NotesController(
            repository = DocumentHttpRepository(
                request = { method, path, body -> controller.authenticatedRequest(method, path, body)?.let { TodayHttpResponse(it.status, it.body) } },
                onUnauthorized = controller::restore,
            ),
            onUnauthorized = controller::restore,
        )
        settingsController = SettingsController(
            repository = SettingsHttpRepository(
                request = { method, path, body -> controller.authenticatedRequest(method, path, body)?.let { TodayHttpResponse(it.status, it.body) } },
            ),
            onUnauthorized = controller::restore,
        )
        dailyController = DailyController(
            repository = DailyDocumentHttpRepository(
                request = { method, path, body -> controller.authenticatedRequest(method, path, body)?.let { TodayHttpResponse(it.status, it.body) } },
                onUnauthorized = controller::restore,
            ),
            loadDay = todayRepository::loadDay,
            onUnauthorized = controller::restore,
        )
        realtimeHttpClient = OkHttpClient()
        realtimeManager = RealtimeConnectionManager(
            cookieProvider = controller::realtimeCookieHeader,
            socketFactory = OkHttpRealtimeSocketFactory(BuildConfig.TASKCHUTE_BASE_URL, realtimeHttpClient),
            scheduler = AndroidRealtimeScheduler(),
            authProbe = RealtimeAuthProbe { callback ->
                lifecycleScope.launch(Dispatchers.IO) {
                    val status = controller.probeRealtimeSession()
                    runOnUiThread { callback(status) }
                }
            },
            callbacks = RealtimeConnectionCallbacks(
                onConnected = {
                    runOnUiThread {
                        todayController.onRealtimeConnected()
                        notesController.onRealtimeConnected()
                        dailyController.onRealtimeConnected()
                    }
                },
                onDayInvalidation = { logicalDate -> runOnUiThread { todayController.onRealtimeDayInvalidation(logicalDate) } },
                onDocumentsInvalidation = { documentIds ->
                    runOnUiThread {
                        notesController.onRealtimeDocumentsInvalidation(documentIds)
                        dailyController.onRealtimeDocumentsInvalidation(documentIds)
                    }
                },
                onAuthFailure = { runOnUiThread { controller.restore() } },
            ),
        )
        setContent {
            TaskChuteApp(
                controller,
                todayController,
                planningController,
                directManipulationController,
                notesController,
                settingsController,
                dailyController,
                realtimeManager,
                wearPairingController,
                reviewDailyMetricsController,
                reviewPeriodMetricsController,
            )
        }
    }

    override fun onStart() {
        super.onStart()
        if (::wearPairingController.isInitialized) wearPairingController.setForeground(true)
        if (::realtimeManager.isInitialized && controller.state is AuthUiState.SignedIn) {
            realtimeManager.start()
            todayController.onRealtimeForeground()
            notesController.onRealtimeForeground()
            dailyController.onRealtimeForeground()
        }
    }

    override fun onStop() {
        if (::wearPairingController.isInitialized) wearPairingController.setForeground(false)
        if (::realtimeManager.isInitialized) realtimeManager.stop()
        super.onStop()
    }

    override fun onDestroy() {
        controller.close()
        todayController.close()
        planningController.close()
        directManipulationController.close()
        notesController.close()
        settingsController.close()
        dailyController.close()
        reviewDailyMetricsController.close()
        reviewPeriodMetricsController.close()
        wearPairingController.close()
        realtimeManager.stop()
        realtimeHttpClient.dispatcher.executorService.shutdown()
        realtimeHttpClient.connectionPool.evictAll()
        super.onDestroy()
    }
}

@Composable
private fun TaskChuteApp(
    controller: AuthController,
    todayController: TodayController,
    planningController: TaskPlanningController,
    directManipulationController: TodayDirectManipulationController,
    notesController: NotesController,
    settingsController: SettingsController,
    dailyController: DailyController,
    realtimeManager: RealtimeConnectionManager,
    wearPairingController: PhoneWearPairingController,
    reviewDailyMetricsController: ReviewDailyMetricsController,
    reviewPeriodMetricsController: ReviewPeriodMetricsController,
) {
    val state = controller.state
    val appContext = LocalContext.current.applicationContext
    var destination by remember { mutableStateOf(AndroidDestination.TODAY) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var signOutConfirmationVisible by remember { mutableStateOf(false) }
    var authenticatedSessionActive by remember { mutableStateOf(false) }
    var internalLinkBackStack by remember { mutableStateOf<List<InternalLinkSource>>(emptyList()) }
    var internalLinkInProgress by remember { mutableStateOf(false) }
    var internalLinkError by remember { mutableStateOf<String?>(null) }
    var dailyInitialDate by remember { mutableStateOf<String?>(null) }
    val appScope = rememberCoroutineScope()

    fun navigateNormally(next: AndroidDestination) {
        internalLinkBackStack = emptyList()
        internalLinkError = null
        internalLinkInProgress = false
        dailyInitialDate = null
        destination = next
    }

    fun currentInternalLinkSource(): InternalLinkSource? = when (destination) {
        AndroidDestination.DAILY -> dailyController.state.document?.logicalDate?.let { InternalLinkSource.Daily(it) }
        AndroidDestination.NOTES, AndroidDestination.TODAY -> notesController.state.editor
            ?.takeIf { destination == AndroidDestination.NOTES || it.origin == com.hedgetheapp.taskchute.document.NoteEditorOrigin.TODAY_TASK }
            ?.document?.documentId?.let { InternalLinkSource.Note(it, destination) }
        else -> null
    }

    fun closeInternalLinkFlowForSaveFailure() {
        internalLinkInProgress = false
        internalLinkError = "保存または競合を解決してからリンク先へ移動してください。"
    }

    fun navigateBackThroughInternalLinks() {
        if (internalLinkInProgress) return
        val source = internalLinkBackStack.lastOrNull() ?: return
        internalLinkInProgress = true
        internalLinkError = null
        appScope.launch {
            when (source) {
                is InternalLinkSource.Note -> when (val result = notesController.resolveInternalLink(source.documentId)) {
                    is DocumentResult.Success -> {
                        notesController.openResolvedInternalLink(result.document)
                        dailyInitialDate = null
                        destination = source.returnDestination
                        internalLinkBackStack = internalLinkBackStack.dropLast(1)
                        internalLinkInProgress = false
                    }
                    DocumentResult.Missing -> { internalLinkError = "元のノートは利用できません。"; internalLinkInProgress = false }
                    DocumentResult.Unauthorized -> { internalLinkError = "認証が必要です。"; internalLinkInProgress = false }
                    is DocumentResult.Failure -> { internalLinkError = "元のノートを読み込めませんでした。"; internalLinkInProgress = false }
                    is DocumentResult.Conflict, is DocumentResult.Ambiguous -> { internalLinkError = "元のノートを読み込めませんでした。"; internalLinkInProgress = false }
                }
                is InternalLinkSource.Daily -> when (val result = dailyController.resolveExistingDate(source.logicalDate)) {
                    is DailyResult.Success -> {
                        if (result.document.logicalDate != source.logicalDate) {
                            internalLinkError = "元のデイリーノートは利用できません。"
                        } else {
                            dailyController.openResolvedDate(result.document)
                            dailyInitialDate = source.logicalDate
                            destination = AndroidDestination.DAILY
                            internalLinkBackStack = internalLinkBackStack.dropLast(1)
                        }
                        internalLinkInProgress = false
                    }
                    DailyResult.Missing -> { internalLinkError = "元のデイリーノートは利用できません。"; internalLinkInProgress = false }
                    DailyResult.Unauthorized -> { internalLinkError = "認証が必要です。"; internalLinkInProgress = false }
                    is DailyResult.Failure, is DailyResult.Conflict, is DailyResult.Ambiguous -> { internalLinkError = "元のデイリーノートを読み込めませんでした。"; internalLinkInProgress = false }
                }
            }
        }
    }

    fun openInternalLink(route: AndroidInternalDocumentRoute) {
        if (internalLinkInProgress) return
        val source = currentInternalLinkSource()
        if (source == null) {
            internalLinkError = "この画面からリンク先を開けません。"
            return
        }
        if (route is AndroidInternalDocumentRoute.Note && source is InternalLinkSource.Note && route.documentId == source.documentId) return
        val noteEditor = notesController.state.editor
        val noteBlocked = notesController.state.lifecycleSaving || notesController.state.unresolvedLifecycleRequest != null ||
            noteEditor?.blocked == true || noteEditor?.saveStatus in setOf(NoteSaveStatus.CONFLICT, NoteSaveStatus.AMBIGUOUS, NoteSaveStatus.ERROR)
        val dailyBlocked = dailyController.state.blocked || dailyController.state.saveStatus in setOf(DailySaveStatus.CONFLICT, DailySaveStatus.AMBIGUOUS, DailySaveStatus.ERROR)
        if ((source is InternalLinkSource.Note && noteBlocked) || (source is InternalLinkSource.Daily && dailyBlocked)) {
            internalLinkError = "保存または競合を解決してからリンク先へ移動してください。"
            return
        }
        if (route is AndroidInternalDocumentRoute.Note && source !is InternalLinkSource.Note && notesController.hasUnsavedChanges) {
            internalLinkError = "Notesの未保存または未解決の変更を先に確認してください。"
            return
        }
        if (route is AndroidInternalDocumentRoute.Daily && source !is InternalLinkSource.Daily && dailyController.hasUnsavedChanges) {
            internalLinkError = "Dailyの未保存または未解決の変更を先に確認してください。"
            return
        }

        internalLinkInProgress = true
        internalLinkError = null
        appScope.launch {
            when (route) {
                is AndroidInternalDocumentRoute.Note -> when (val result = notesController.resolveInternalLink(route.documentId)) {
                    is DocumentResult.Success -> {
                        if (result.document.documentId != route.documentId) {
                            internalLinkError = "リンク先のノートは利用できません。"
                            internalLinkInProgress = false
                            return@launch
                        }
                        val afterFlush = {
                            internalLinkBackStack = (internalLinkBackStack + source).takeLast(20)
                            dailyInitialDate = null
                            notesController.openResolvedInternalLink(result.document)
                            destination = if (result.document.kind == com.hedgetheapp.taskchute.document.DocumentKind.TASK_PRIMARY) {
                                AndroidDestination.TODAY
                            } else {
                                AndroidDestination.NOTES
                            }
                            internalLinkInProgress = false
                        }
                        if (source is InternalLinkSource.Daily) dailyController.flushAndNavigate(afterFlush)
                        else notesController.flushAndNavigate(afterFlush)
                    }
                    DocumentResult.Missing -> { internalLinkError = "リンク先のノートは利用できません。"; internalLinkInProgress = false }
                    DocumentResult.Unauthorized -> { internalLinkError = "認証が必要です。"; internalLinkInProgress = false }
                    is DocumentResult.Failure, is DocumentResult.Conflict, is DocumentResult.Ambiguous -> { internalLinkError = "リンク先のノートを読み込めませんでした。"; internalLinkInProgress = false }
                }
                is AndroidInternalDocumentRoute.Daily -> when (val result = dailyController.resolveExistingDate(route.logicalDate)) {
                    is DailyResult.Success -> {
                        if (result.document.logicalDate != route.logicalDate) {
                            internalLinkError = "リンク先のデイリーノートは利用できません。"
                            internalLinkInProgress = false
                            return@launch
                        }
                        val afterFlush = {
                            internalLinkBackStack = (internalLinkBackStack + source).takeLast(20)
                            dailyController.openResolvedDate(result.document)
                            dailyInitialDate = result.document.logicalDate
                            destination = AndroidDestination.DAILY
                            internalLinkInProgress = false
                        }
                        if (source is InternalLinkSource.Daily) dailyController.flushAndNavigate(afterFlush)
                        else notesController.flushAndNavigate(afterFlush)
                    }
                    DailyResult.Missing -> { internalLinkError = "リンク先のデイリーノートは利用できません。"; internalLinkInProgress = false }
                    DailyResult.Unauthorized -> { internalLinkError = "認証が必要です。"; internalLinkInProgress = false }
                    is DailyResult.Failure, is DailyResult.Conflict, is DailyResult.Ambiguous -> { internalLinkError = "リンク先のデイリーノートを読み込めませんでした。"; internalLinkInProgress = false }
                }
            }
        }
    }

    fun continueSignOut() {
        realtimeManager.stop()
        planningController.dismiss()
        controller.signOut()
    }

    fun requestSignOut() {
        if (notesController.hasUnsavedChanges || dailyController.hasUnsavedChanges) {
            signOutConfirmationVisible = true
        } else {
            continueSignOut()
        }
    }

    LaunchedEffect(controller) { controller.restore() }
    LaunchedEffect(state) {
        wearPairingController.setSignedIn(state is AuthUiState.SignedIn)
        if (state is AuthUiState.SignedIn) {
            authenticatedSessionActive = true
            realtimeManager.start()
            todayController.onRealtimeForeground()
            notesController.onRealtimeForeground()
            dailyController.onRealtimeForeground()
        } else {
            todayController.resetForSessionChange()
            reviewDailyMetricsController.resetForSessionChange()
            reviewPeriodMetricsController.resetForSessionChange()
            if (authenticatedSessionActive) {
                notesController.resetForSessionChange()
                dailyController.resetForSessionChange()
            }
            authenticatedSessionActive = false
            signOutConfirmationVisible = false
            realtimeManager.stop()
            if (state is AuthUiState.SignedOut) {
                AndroidHomeWidgetIntents.requestRefresh(appContext)
                navigateNormally(AndroidDestination.TODAY)
                planningController.dismiss()
            }
        }
    }
    LaunchedEffect(
        internalLinkInProgress,
        destination,
        notesController.state.editor?.saveStatus,
        dailyController.state.saveStatus,
        notesController.state.lifecycleSaving,
        notesController.state.unresolvedLifecycleRequest,
    ) {
        if (!internalLinkInProgress) return@LaunchedEffect
        val noteEditor = notesController.state.editor
        val noteFailed = notesController.state.lifecycleSaving.not() && notesController.state.unresolvedLifecycleRequest == null &&
            noteEditor?.saveStatus in setOf(NoteSaveStatus.CONFLICT, NoteSaveStatus.AMBIGUOUS, NoteSaveStatus.ERROR)
        val dailyFailed = dailyController.state.saveStatus in setOf(DailySaveStatus.CONFLICT, DailySaveStatus.AMBIGUOUS, DailySaveStatus.ERROR)
        if ((destination == AndroidDestination.DAILY && dailyFailed) || (destination != AndroidDestination.DAILY && noteFailed)) {
            closeInternalLinkFlowForSaveFailure()
        }
    }

    TaskChuteTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxSize()) {
            when (authScreenPresentation(state)) {
                AuthScreenPresentation.GENERIC_LOADING -> FullScreenLoadingPresentation()
                AuthScreenPresentation.SIGNING_IN -> LoginForm(email, password, { email = it }, { password = it }, true) { }
                AuthScreenPresentation.SIGNING_OUT -> Centered("ログアウトしています…", true)
                AuthScreenPresentation.LOGIN -> {
                    val signedOut = state as AuthUiState.SignedOut
                    LoginForm(email, password, { email = it }, { password = it }, false, signedOut.message) {
                        val submitted = password
                        password = ""
                        controller.signIn(email, submitted)
                    }
                }
                AuthScreenPresentation.RETRY_ERROR -> {
                    val networkError = state as AuthUiState.NetworkError
                    ErrorState(networkError.message, controller::retry)
                }
                AuthScreenPresentation.AUTHENTICATED -> {
                    val signOut = ::requestSignOut
                    when (destination) {
                        AndroidDestination.TODAY -> TodayScreen(
                            controller = todayController,
                            planningController = planningController,
                            onNavigateSettings = { navigateNormally(AndroidDestination.SETTINGS) },
                            onNavigateNotes = { navigateNormally(AndroidDestination.NOTES) },
                            onNavigateDaily = { navigateNormally(AndroidDestination.DAILY) },
                            onNavigateReview = { navigateNormally(AndroidDestination.REVIEW) },
                            directManipulationController = directManipulationController,
                            taskNoteController = notesController,
                            onOpenTaskNote = { task -> task.taskId?.let { notesController.openTaskPrimary(it, task.title, task.primaryDocumentId) } },
                            onOpenInternalLink = ::openInternalLink,
                            onSearchInternalLinks = notesController::searchInternalLinks,
                            onNavigateInternalBack = if (internalLinkBackStack.isNotEmpty()) ::navigateBackThroughInternalLinks else null,
                            onSignOut = signOut,
                        )
                        AndroidDestination.SETTINGS -> SettingsScreen(
                            controller = settingsController,
                            onNavigateToday = { navigateNormally(AndroidDestination.TODAY) },
                            onNavigateNotes = { navigateNormally(AndroidDestination.NOTES) },
                            onNavigateDaily = { navigateNormally(AndroidDestination.DAILY) },
                            onNavigateReview = { navigateNormally(AndroidDestination.REVIEW) },
                            onSignOut = signOut,
                        )
                        AndroidDestination.NOTES -> NotesScreen(
                            controller = notesController,
                            onNavigateToday = { navigateNormally(AndroidDestination.TODAY) },
                            onNavigateSettings = { navigateNormally(AndroidDestination.SETTINGS) },
                            onNavigateDaily = { navigateNormally(AndroidDestination.DAILY) },
                            onNavigateReview = { navigateNormally(AndroidDestination.REVIEW) },
                            onOpenInternalLink = ::openInternalLink,
                            onSearchInternalLinks = notesController::searchInternalLinks,
                            onNavigateInternalBack = if (internalLinkBackStack.isNotEmpty()) ::navigateBackThroughInternalLinks else null,
                        )
                        AndroidDestination.DAILY -> DailyScreen(
                            controller = dailyController,
                            onNavigateToday = { navigateNormally(AndroidDestination.TODAY) },
                            onNavigateNotes = { navigateNormally(AndroidDestination.NOTES) },
                            onNavigateSettings = { navigateNormally(AndroidDestination.SETTINGS) },
                            onNavigateReview = { navigateNormally(AndroidDestination.REVIEW) },
                            initialDate = dailyInitialDate,
                            onOpenInternalLink = ::openInternalLink,
                            onSearchInternalLinks = notesController::searchInternalLinks,
                            onNavigateInternalBack = if (internalLinkBackStack.isNotEmpty()) ::navigateBackThroughInternalLinks else null,
                        )
                        AndroidDestination.REVIEW -> ReviewScreen(
                            dailyMetricsController = reviewDailyMetricsController,
                            periodMetricsController = reviewPeriodMetricsController,
                            onNavigateToday = { navigateNormally(AndroidDestination.TODAY) },
                            onNavigateNotes = { navigateNormally(AndroidDestination.NOTES) },
                            onNavigateDaily = { navigateNormally(AndroidDestination.DAILY) },
                            onNavigateSettings = { navigateNormally(AndroidDestination.SETTINGS) },
                        )
                    }
                }
            }
            if (signOutConfirmationVisible && state is AuthUiState.SignedIn) {
                AlertDialog(
                    onDismissRequest = { signOutConfirmationVisible = false },
                    title = { Text("未保存の変更があります") },
                    text = { Text("NotesまたはDailyの未保存・未解決の変更は、ログアウトすると破棄されます。") },
                    confirmButton = {
                        TextButton(onClick = {
                            signOutConfirmationVisible = false
                            internalLinkBackStack = emptyList()
                            dailyInitialDate = null
                            internalLinkInProgress = false
                            notesController.resetForSessionChange()
                            dailyController.resetForSessionChange()
                            continueSignOut()
                        }) { Text("破棄してログアウト") }
                    },
                    dismissButton = {
                        TextButton(onClick = { signOutConfirmationVisible = false }) { Text("キャンセル") }
                    },
                )
            }
            internalLinkError?.let { message ->
                AlertDialog(
                    onDismissRequest = { internalLinkError = null },
                    title = { Text("ノートを開けません") },
                    text = { Text(message) },
                    confirmButton = { TextButton(onClick = { internalLinkError = null }) { Text("閉じる") } },
                )
            }
                if (state is AuthUiState.SignedIn) WearPairingConfirmationDialog(wearPairingController)
            }
        }
    }
}

@Composable
private fun WearPairingConfirmationDialog(controller: PhoneWearPairingController) {
    val pairing = controller.pending ?: return
    AlertDialog(
        onDismissRequest = { if (!pairing.submitting) controller.reject() },
        title = { Text("Wear OS から接続要求") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("このWatchをTaskChuteへ接続しますか？")
                val errorMessage = pairing.error
                if (errorMessage != null) Text(errorMessage, color = MaterialTheme.colorScheme.error)
            }
        },
        confirmButton = {
            TextButton(onClick = controller::confirm, enabled = !pairing.submitting) {
                Text(if (pairing.submitting) "接続中…" else "接続")
            }
        },
        dismissButton = {
            TextButton(onClick = controller::reject, enabled = !pairing.submitting) { Text("拒否") }
        },
    )
}

@Composable
private fun LoginForm(email: String, password: String, onEmailChange: (String) -> Unit, onPasswordChange: (String) -> Unit, disabled: Boolean, message: String? = null, onSubmit: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("TaskChute", style = MaterialTheme.typography.headlineMedium)
        Text("Android ネイティブ認証", style = MaterialTheme.typography.titleMedium)
        message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        OutlinedTextField(email, onEmailChange, label = { Text("メールアドレス") }, enabled = !disabled, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(password, onPasswordChange, label = { Text("パスワード") }, enabled = !disabled, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        Button(onClick = onSubmit, enabled = !disabled && email.isNotBlank() && password.isNotEmpty()) { Text("ログイン") }
    }
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(message, color = MaterialTheme.colorScheme.error)
        Button(onClick = onRetry) { Text("再試行") }
    }
}

@Composable
private fun Centered(message: String, showProgress: Boolean) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(message)
        if (showProgress) CircularProgressIndicator()
    }
}

