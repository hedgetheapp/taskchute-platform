package com.hedgetheapp.taskchute.wear

internal data class WearPairingPresentation(
    val actionLabel: String,
    val actionContentDescription: String,
    val isBusy: Boolean,
    val errorTitle: String? = null,
    val errorMessage: String? = null,
)

internal fun WearPairingState.presentation(): WearPairingPresentation = when (this) {
    WearPairingState.Idle -> WearPairingPresentation(
        actionLabel = "アプリで接続",
        actionContentDescription = "アプリで接続",
        isBusy = false,
    )
    WearPairingState.Sending,
    WearPairingState.Waiting,
    WearPairingState.Exchanging -> WearPairingPresentation(
        actionLabel = "アプリで接続",
        actionContentDescription = "アプリで接続",
        isBusy = true,
    )
    is WearPairingState.Error -> WearPairingPresentation(
        actionLabel = "再試行",
        actionContentDescription = "再試行",
        isBusy = false,
        errorTitle = "接続できません",
        errorMessage = message,
    )
}
