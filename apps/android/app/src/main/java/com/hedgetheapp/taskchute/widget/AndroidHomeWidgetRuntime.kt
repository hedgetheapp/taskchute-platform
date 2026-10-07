package com.hedgetheapp.taskchute.widget

import android.content.Context
import com.hedgetheapp.taskchute.BuildConfig
import com.hedgetheapp.taskchute.auth.AuthSessionCoordinator
import com.hedgetheapp.taskchute.network.NativeAuthHttpClient
import com.hedgetheapp.taskchute.security.EncryptedSessionStore
import com.hedgetheapp.taskchute.today.TodayHttpRepository
import com.hedgetheapp.taskchute.today.TodayHttpResponse

internal sealed interface AndroidHomeWidgetRuntime {
    data class Ready(val controller: AndroidHomeWidgetController) : AndroidHomeWidgetRuntime
    data object SignedOut : AndroidHomeWidgetRuntime
    data object Unavailable : AndroidHomeWidgetRuntime
}

/** Reopens the existing encrypted Better Auth session for one bounded Widget operation. */
internal fun createAndroidHomeWidgetRuntime(context: Context): AndroidHomeWidgetRuntime {
    val appContext = context.applicationContext
    // A receiver shares Android's broadcast execution deadline. Keep each exchange short so
    // a canonical read, command, reconciliation read, and a possible 401 restore stay bounded.
    val transport = runCatching { NativeAuthHttpClient(BuildConfig.TASKCHUTE_BASE_URL, requestTimeoutMs = 2_000) }
        .getOrNull() ?: return AndroidHomeWidgetRuntime.Unavailable
    val store = EncryptedSessionStore(appContext)
    val savedSession = runCatching { store.load() }.getOrNull() ?: return AndroidHomeWidgetRuntime.SignedOut
    transport.useSession(savedSession)
    val sessionCoordinator = AuthSessionCoordinator(transport, store)
    val repository = TodayHttpRepository(
        request = { method, path, body ->
            transport.requestAuthenticated(method, path, body).let { response ->
                TodayHttpResponse(response.status, response.body)
            }
        },
        onUnauthorized = { sessionCoordinator.restore() },
        diagnosticsEnabled = false,
    )
    return AndroidHomeWidgetRuntime.Ready(AndroidHomeWidgetController(repository))
}
