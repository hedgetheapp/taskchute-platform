package com.hedgetheapp.taskchute.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.hedgetheapp.taskchute.auth.AuthUiState
import com.hedgetheapp.taskchute.today.TodayLoadStatus

internal enum class AuthScreenPresentation {
    GENERIC_LOADING,
    LOGIN,
    SIGNING_IN,
    SIGNING_OUT,
    RETRY_ERROR,
    AUTHENTICATED,
}

internal fun authScreenPresentation(state: AuthUiState): AuthScreenPresentation = when (state) {
    AuthUiState.Restoring -> AuthScreenPresentation.GENERIC_LOADING
    is AuthUiState.SignedOut -> AuthScreenPresentation.LOGIN
    AuthUiState.SigningIn -> AuthScreenPresentation.SIGNING_IN
    AuthUiState.SigningOut -> AuthScreenPresentation.SIGNING_OUT
    is AuthUiState.NetworkError -> AuthScreenPresentation.RETRY_ERROR
    is AuthUiState.SignedIn -> AuthScreenPresentation.AUTHENTICATED
}

internal enum class TodayScreenPresentation {
    GENERIC_LOADING,
    CONTENT,
    RETRY_ERROR,
}

internal fun todayScreenPresentation(status: TodayLoadStatus): TodayScreenPresentation = when (status) {
    TodayLoadStatus.LOADING,
    TodayLoadStatus.AUTH_REQUIRED,
    -> TodayScreenPresentation.GENERIC_LOADING

    TodayLoadStatus.REFRESHING,
    TodayLoadStatus.CONTENT,
    TodayLoadStatus.EMPTY,
    -> TodayScreenPresentation.CONTENT

    TodayLoadStatus.ERROR -> TodayScreenPresentation.RETRY_ERROR
}

@Composable
internal fun FullScreenLoadingPresentation(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().background(TaskChuteColors.Background),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(32.dp),
            color = Color.White,
            strokeWidth = 3.dp,
        )
        Spacer(Modifier.height(12.dp))
        Text("読み込み中", color = TaskChuteColors.SecondaryText)
    }
}
