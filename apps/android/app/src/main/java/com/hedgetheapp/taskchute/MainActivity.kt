package com.hedgetheapp.taskchute

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import com.hedgetheapp.taskchute.today.TodayController
import com.hedgetheapp.taskchute.today.TodayHttpRepository
import com.hedgetheapp.taskchute.today.TodayHttpResponse
import com.hedgetheapp.taskchute.today.TodayScreen

class MainActivity : ComponentActivity() {
    private lateinit var controller: AuthController
    private lateinit var todayController: TodayController

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
        setContent { TaskChuteApp(controller, todayController) }
    }

    override fun onDestroy() {
        controller.close()
        todayController.close()
        super.onDestroy()
    }
}

@Composable
private fun TaskChuteApp(controller: AuthController, todayController: TodayController) {
    val state = controller.state
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    LaunchedEffect(controller) { controller.restore() }

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
                is AuthUiState.SignedIn -> TodayScreen(todayController, controller::signOut)
            }
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
