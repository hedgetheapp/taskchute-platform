package com.hedgetheapp.taskchute.ui

import com.hedgetheapp.taskchute.auth.AuthUiState
import com.hedgetheapp.taskchute.today.TodayLoadStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class LoadingPresentationTest {
    @Test
    fun authRestoreUsesGenericLoadingAndUserActionStatesRemainExplicit() {
        assertEquals(AuthScreenPresentation.GENERIC_LOADING, authScreenPresentation(AuthUiState.Restoring))
        assertEquals(AuthScreenPresentation.LOGIN, authScreenPresentation(AuthUiState.SignedOut()))
        assertEquals(AuthScreenPresentation.SIGNING_IN, authScreenPresentation(AuthUiState.SigningIn))
        assertEquals(AuthScreenPresentation.SIGNING_OUT, authScreenPresentation(AuthUiState.SigningOut))
        assertEquals(AuthScreenPresentation.AUTHENTICATED, authScreenPresentation(AuthUiState.SignedIn()))
        assertEquals(
            AuthScreenPresentation.RETRY_ERROR,
            authScreenPresentation(AuthUiState.NetworkError("retry", sessionRetained = true)),
        )
    }

    @Test
    fun todayInitialLoadAndAuthReconciliationUseGenericLoading() {
        assertEquals(TodayScreenPresentation.GENERIC_LOADING, todayScreenPresentation(TodayLoadStatus.LOADING))
        assertEquals(TodayScreenPresentation.GENERIC_LOADING, todayScreenPresentation(TodayLoadStatus.AUTH_REQUIRED))
    }

    @Test
    fun todayContentAndRetryErrorRemainExplicit() {
        assertEquals(TodayScreenPresentation.CONTENT, todayScreenPresentation(TodayLoadStatus.CONTENT))
        assertEquals(TodayScreenPresentation.CONTENT, todayScreenPresentation(TodayLoadStatus.EMPTY))
        assertEquals(TodayScreenPresentation.CONTENT, todayScreenPresentation(TodayLoadStatus.REFRESHING))
        assertEquals(TodayScreenPresentation.RETRY_ERROR, todayScreenPresentation(TodayLoadStatus.ERROR))
    }
}
