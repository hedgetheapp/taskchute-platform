package com.hedgetheapp.taskchute

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.lifecycleScope
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import com.hedgetheapp.taskchute.today.AndroidDestination
import com.hedgetheapp.taskchute.today.AndroidNavigationBar
import com.hedgetheapp.taskchute.today.TaskPlanningUiState
import com.hedgetheapp.taskchute.document.DocumentHttpRepository
import com.hedgetheapp.taskchute.document.NotesController
import com.hedgetheapp.taskchute.document.NotesScreen
import com.hedgetheapp.taskchute.today.TodayDirectManipulationController
import com.hedgetheapp.taskchute.today.TodayDirectManipulationHttpRepository

class MainActivity : ComponentActivity() {
    private lateinit var controller: AuthController
    private lateinit var todayController: TodayController
    private lateinit var realtimeManager: RealtimeConnectionManager
    private lateinit var realtimeHttpClient: OkHttpClient
    private lateinit var planningController: TaskPlanningController
    private lateinit var directManipulationController: TodayDirectManipulationController
    private lateinit var notesController: NotesController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        controller = AuthController(this, BuildConfig.TASKCHUTE_BASE_URL)
        todayController = TodayController(
            repository = TodayHttpRepository(
                request = { method, path, body ->
                    controller.authenticatedRequest(method, path, body)?.let { TodayHttpResponse(it.status, it.body) }
                },
                onUnauthorized = {},
            ),
            onUnauthorized = controller::restore,
        )
        planningController = TaskPlanningController(
            repository = TaskPlanningHttpRepository { method, path, body ->
                controller.authenticatedRequest(method, path, body)?.let { TodayHttpResponse(it.status, it.body) }
            },
            onUnauthorized = controller::restore,
            onSaved = todayController::refresh,
        )
        directManipulationController = TodayDirectManipulationController(
            repository = TodayDirectManipulationHttpRepository(
                request = { method, path, body ->
                    controller.authenticatedRequest(method, path, body)?.let { TodayHttpResponse(it.status, it.body) }
                },
                onUnauthorized = controller::restore,
            ),
            onRefresh = todayController::refresh,
            onUnauthorized = controller::restore,
        )
        notesController = NotesController(
            repository = DocumentHttpRepository(
                request = { method, path, body ->
                    controller.authenticatedRequest(method, path, body)?.let { TodayHttpResponse(it.status, it.body) }
                },
                onUnauthorized = controller::restore,
            ),
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
                onConnected = { runOnUiThread { todayController.onRealtimeConnected() } },
                onDayInvalidation = { logicalDate -> runOnUiThread { todayController.onRealtimeDayInvalidation(logicalDate) } },
                onAuthFailure = { runOnUiThread { controller.restore() } },
            ),
        )
        setContent { TaskChuteApp(controller, todayController, planningController, directManipulationController, notesController, realtimeManager) }
    }

    override fun onStart() {
        super.onStart()
        if (::realtimeManager.isInitialized && controller.state is AuthUiState.SignedIn) {
            realtimeManager.start()
            todayController.onRealtimeForeground()
        }
    }

    override fun onStop() {
        if (::realtimeManager.isInitialized) realtimeManager.stop()
        super.onStop()
    }

    override fun onDestroy() {
        controller.close()
        todayController.close()
        planningController.close()
        directManipulationController.close()
        notesController.close()
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
    realtimeManager: RealtimeConnectionManager,
) {
    val state = controller.state
    var destination by remember { mutableStateOf(AndroidDestination.TODAY) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    LaunchedEffect(controller) { controller.restore() }
    LaunchedEffect(state) {
        if (state is AuthUiState.SignedIn) {
            realtimeManager.start()
            todayController.onRealtimeForeground()
        } else if (state is AuthUiState.SignedOut) {
            realtimeManager.stop()
            destination = AndroidDestination.TODAY
            planningController.dismiss()
        }
    }

    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            when (state) {
                AuthUiState.Restoring -> Centered("認証状態を確認しています…", showProgress = true)
                AuthUiState.SigningIn -> LoginForm(email, password, { email = it }, { password = it }, true) { }
                AuthUiState.SigningOut -> Centered("ログアウトしています…", showProgress = true)
                is AuthUiState.SignedOut -> LoginForm(
                    email = email,
                    password = password,
                    onEmailChange = { email = it },
                    onPasswordChange = { password = it },
                    disabled = false,
                    message = state.message,
                ) {
                    val submitted = password
                    password = ""
                    controller.signIn(email, submitted)
                }
                is AuthUiState.NetworkError -> ErrorState(state.message, controller::retry)
                is AuthUiState.SignedIn -> {
                    val signOut = {
                        realtimeManager.stop()
                        planningController.dismiss()
                        controller.signOut()
                    }
                    when (destination) {
                        AndroidDestination.TODAY -> TodayScreen(
                            controller = todayController,
                            planningController = planningController,
                            onNavigateSettings = { destination = AndroidDestination.SETTINGS },
                            onNavigateNotes = { destination = AndroidDestination.NOTES },
                            directManipulationController = directManipulationController,
                            onOpenTaskNote = { task ->
                                task.taskId?.let { taskId ->
                                    notesController.openTaskPrimary(taskId, task.title, task.primaryDocumentId)
                                    destination = AndroidDestination.NOTES
                                }
                            },
                            onSignOut = signOut,
                        )
                        AndroidDestination.SETTINGS -> SettingsScreen(
                            onNavigateToday = { destination = AndroidDestination.TODAY },
                            onNavigateNotes = { destination = AndroidDestination.NOTES },
                            onSignOut = signOut,
                        )
                        AndroidDestination.NOTES -> NotesScreen(
                            controller = notesController,
                            onNavigateToday = { destination = AndroidDestination.TODAY },
                            onNavigateSettings = { destination = AndroidDestination.SETTINGS },
                        )
                        AndroidDestination.PROJECTS -> TodayScreen(
                            controller = todayController,
                            planningController = planningController,
                            onNavigateSettings = { destination = AndroidDestination.SETTINGS },
                            onNavigateNotes = { destination = AndroidDestination.NOTES },
                            directManipulationController = directManipulationController,
                            onOpenTaskNote = { task ->
                                task.taskId?.let { taskId ->
                                    notesController.openTaskPrimary(taskId, task.title, task.primaryDocumentId)
                                    destination = AndroidDestination.NOTES
                                }
                            },
                            onSignOut = signOut,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsScreen(onNavigateToday: () -> Unit, onNavigateNotes: () -> Unit, onSignOut: () -> Unit) {
    Scaffold(
        bottomBar = {
            AndroidNavigationBar(
                selected = AndroidDestination.SETTINGS,
                onToday = onNavigateToday,
                onSettings = {},
                onNotes = onNavigateNotes,
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("設定", style = MaterialTheme.typography.headlineMedium)
            Text("アカウントとアプリの設定")
            Button(onClick = onSignOut) { Text("ログアウト") }
        }
    }
}

@Composable
private fun LoginForm(
    email: String,
    password: String,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    disabled: Boolean,
    message: String? = null,
    onSubmit: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("TaskChute", style = MaterialTheme.typography.headlineMedium)
        Text("Android ネイティブ認証", style = MaterialTheme.typography.titleMedium)
        message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        OutlinedTextField(email, onEmailChange, label = { Text("メールアドレス") }, enabled = !disabled, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(
            password,
            onPasswordChange,
            label = { Text("パスワード") },
            enabled = !disabled,
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
        )
        Button(onClick = onSubmit, enabled = !disabled && email.isNotBlank() && password.isNotEmpty()) { Text("ログイン") }
    }
}

@Composable
private fun SignedInShell(message: String?, onSignOut: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("TaskChute", style = MaterialTheme.typography.headlineMedium)
        Text("認証済みのネイティブシェル", style = MaterialTheme.typography.titleMedium)
        message?.let { Text(it) }
        Button(onClick = onSignOut) { Text("ログアウト") }
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
