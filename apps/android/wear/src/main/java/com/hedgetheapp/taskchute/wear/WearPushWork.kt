package com.hedgetheapp.taskchute.wear

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.google.android.gms.tasks.Tasks
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

internal object WearPushWork {
    private const val INVALIDATION_WORK = "wear-running-projection-invalidation"
    private const val REGISTRATION_WORK = "wear-push-registration"
    private const val MAX_RETRY_ATTEMPTS = 5
    internal val invalidationCoalescingPolicy = ExistingWorkPolicy.REPLACE

    fun enqueueInvalidation(context: Context) = enqueueInvalidationRequest(context,
        OneTimeWorkRequestBuilder<WearProjectionInvalidationWorker>()
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build())

    fun enqueueRegistration(context: Context) = enqueue(context, REGISTRATION_WORK,
        OneTimeWorkRequestBuilder<WearPushRegistrationWorker>()
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build(), ExistingWorkPolicy.APPEND_OR_REPLACE)

    internal fun shouldRetry(attemptCount: Int): Boolean = attemptCount < MAX_RETRY_ATTEMPTS

    private fun enqueueInvalidationRequest(context: Context, request: androidx.work.OneTimeWorkRequest) {
        enqueue(context, INVALIDATION_WORK, request, invalidationCoalescingPolicy)
    }

    private fun enqueue(
        context: Context,
        name: String,
        request: androidx.work.OneTimeWorkRequest,
        policy: ExistingWorkPolicy,
    ) {
        runCatching {
            WorkManager.getInstance(context.applicationContext)
                .enqueueUniqueWork(name, policy, request)
        }
    }
}

internal class WearProjectionInvalidationWorker(
    context: Context,
    parameters: WorkerParameters,
) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        if (BuildConfig.TASKCHUTE_BASE_URL.isBlank()) return@withContext Result.success()
        val repository = WearHttpRepository(BuildConfig.TASKCHUTE_BASE_URL, WearEncryptedSessionStore(applicationContext))
        when (repository.restoreSession()) {
            WearAuthResult.SignedOut, WearAuthResult.ProtocolFailure -> Result.success()
            WearAuthResult.TransientFailure -> retryWithinLimit()
            WearAuthResult.SignedIn -> when (val load = repository.loadToday()) {
                is WearLoadResult.Success -> {
                    currentCoroutineContext().ensureActive()
                    WearComplicationRefreshRequester.request(applicationContext)
                    Result.success()
                }
                WearLoadResult.Unauthorized -> Result.success()
                is WearLoadResult.Failure -> if (load.ambiguous) retryWithinLimit() else Result.success()
            }
        }
    }

    private fun retryWithinLimit(): Result =
        if (WearPushWork.shouldRetry(runAttemptCount)) Result.retry() else Result.success()
}

internal class WearPushRegistrationWorker(
    context: Context,
    parameters: WorkerParameters,
) : CoroutineWorker(context, parameters) {
    @Suppress("DEPRECATION")
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        if (FirebaseApp.getApps(applicationContext).isEmpty() || BuildConfig.TASKCHUTE_BASE_URL.isBlank()) {
            return@withContext Result.success()
        }
        val installationId = runCatching { WearInstallationIdStore.get(applicationContext) }
            .getOrElse { return@withContext retryWithinLimit() }
        val repository = WearHttpRepository(BuildConfig.TASKCHUTE_BASE_URL, WearEncryptedSessionStore(applicationContext))
        when (repository.restoreSession()) {
            WearAuthResult.SignedOut, WearAuthResult.ProtocolFailure -> return@withContext Result.success()
            WearAuthResult.TransientFailure -> return@withContext retryWithinLimit()
            WearAuthResult.SignedIn -> Unit
        }
        val token = runCatching {
            Tasks.await(FirebaseMessaging.getInstance().token, TOKEN_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        }.getOrElse { return@withContext retryWithinLimit() }
        when (repository.registerPushToken(installationId, token)) {
            WearPushRegistrationResult.Success -> Result.success()
            WearPushRegistrationResult.Retry -> retryWithinLimit()
            WearPushRegistrationResult.Unauthorized, WearPushRegistrationResult.Rejected -> Result.success()
        }
    }

    private fun retryWithinLimit(): Result =
        if (WearPushWork.shouldRetry(runAttemptCount)) Result.retry() else Result.success()

    private companion object { const val TOKEN_TIMEOUT_SECONDS = 20L }
}
