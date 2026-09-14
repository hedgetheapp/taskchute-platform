package com.hedgetheapp.taskchute.security

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.hedgetheapp.taskchute.auth.SessionCredential
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EncryptedSessionStoreInstrumentedTest {
    @Test
    fun storesOnlyInNoBackupFilesDirAndRoundTrips() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = EncryptedSessionStore(context)
        val session = SessionCredential(mapOf("__Secure-dynamic" to "opaque"))
        store.clear()

        assertTrue(store.save(session))
        assertEquals(session, store.load())
        assertTrue(context.noBackupFilesDir.resolve("taskchute-session.bin").parentFile == context.noBackupFilesDir)

        store.clear()
        assertEquals(null, store.load())
    }
}
