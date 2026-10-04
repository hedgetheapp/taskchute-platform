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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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
import com.hedgetheapp.taskchute.today.TodayScreen
import com.hedgetheapp.taskchute.today.TaskPlanningController
import com.hedgetheapp.taskchute.today.TaskPlanningHttpRepository
import com.hedgetheapp.taskchute.ui.AndroidDestination
import com.hedgetheapp.taskchute.ui.AuthScreenPresentation
import com.hedgetheapp.taskchute.ui.FullScreenLoadingPresentation
import com.hedgetheapp.taskchute.ui.TaskChuteTheme
import com.hedgetheapp.taskchute.ui.authScreenPresentation
import com.hedgetheapp.taskchute.document.DailyController
import com.hedgetheapp.taskchute.document.DailyDocumentHttpRepository
import com.hedgetheapp.taskchute.document.DailyScreen
import com.hedgetheapp.taskchute.document.DocumentHttpRepository
import com.hedgetheapp.taskchute.document.NotesController
import com.hedgetheapp.taskchute.document.NotesScreen
import com.hedgetheapp.taskchute.today.TodayDirectManipulationController
import com.hedgetheapp.taskchute.today.TodayDirectManipulationHttpRepository
import com.hedgetheapp.taskchute.settings.SettingsController
import com.hedgetheapp.taskchute.settings.SettingsHttpRepository
import com.hedgetheapp.taskchute.settings.SettingsScreen
import com.hedgetheapp.taskchute.reminders.TaskReminderScheduler

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
        )
        todayController = TodayController(
            repository = todayRepository,
            onUnauthorized = controller::restore,
            onCanonicalDayLoaded = taskReminderScheduler::reconcile,
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
        setContent { TaskChuteApp(controller, todayController, planningController, directManipulationController, notesController, settingsController, dailyController, realtimeManager, wearPairingController) }
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
) {
    val state = controller.state
    var destination by remember { mutableStateOf(AndroidDestination.TODAY) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    LaunchedEffect(controller) { controller.restore() }
    LaunchedEffect(state) {
        wearPairingController.setSignedIn(state is AuthUiState.SignedIn)
        if (state is AuthUiState.SignedIn) {
            realtimeManager.start()
            todayController.onRealtimeForeground()
            notesController.onRealtimeForeground()
            dailyController.onRealtimeForeground()
        } else if (state is AuthUiState.SignedOut) {
            realtimeManager.stop()
            destination = AndroidDestination.TODAY
            planningController.dismiss()
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
                    val signOut = { realtimeManager.stop(); planningController.dismiss(); controller.signOut() }
                    when (destination) {
                        AndroidDestination.TODAY -> TodayScreen(
                            controller = todayController,
                            planningController = planningController,
                            onNavigateSettings = { destination = AndroidDestination.SETTINGS },
                            onNavigateNotes = { destination = AndroidDestination.NOTES },
                            onNavigateDaily = { destination = AndroidDestination.DAILY },
                            directManipulationController = directManipulationController,
                            taskNoteController = notesController,
                            onOpenTaskNote = { task -> task.taskId?.let { notesController.openTaskPrimary(it, task.title, task.primaryDocumentId) } },
                            onSignOut = signOut,
                        )
                        AndroidDestination.SETTINGS -> SettingsScreen(
                            controller = settingsController,
                            onNavigateToday = { destination = AndroidDestination.TODAY },
                            onNavigateNotes = { destination = AndroidDestination.NOTES },
                            onNavigateDaily = { destination = AndroidDestination.DAILY },
                            onSignOut = signOut,
                        )
                        AndroidDestination.NOTES -> NotesScreen(
                            controller = notesController,
                            onNavigateToday = { destination = AndroidDestination.TODAY },
                            onNavigateSettings = { destination = AndroidDestination.SETTINGS },
                            onNavigateDaily = { destination = AndroidDestination.DAILY },
                        )
                        AndroidDestination.DAILY -> DailyScreen(
                            controller = dailyController,
                            onNavigateToday = { destination = AndroidDestination.TODAY },
                            onNavigateNotes = { destination = AndroidDestination.NOTES },
                            onNavigateSettings = { destination = AndroidDestination.SETTINGS },
                        )
                    }
                }
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
