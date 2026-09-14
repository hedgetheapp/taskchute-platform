package com.hedgetheapp.taskchute.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.hedgetheapp.taskchute.auth.SessionCredential
import com.hedgetheapp.taskchute.auth.SessionStore
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

class EncryptedSessionStore(context: Context) : SessionStore {
    private val file = File(context.noBackupFilesDir, FILE_NAME)

    override fun load(): SessionCredential? {
        return try {
            if (!file.isFile || file.length() > MAX_FILE_BYTES) return null
            FileInputStream(file).use { input ->
                val envelope = input.readBytes()
                decrypt(envelope)?.let(SessionEnvelopeCodec::decode)
            }
        } catch (_: Exception) {
            file.delete()
            null
        }
    }

    override fun save(session: SessionCredential): Boolean {
        val temporary = File(file.parentFile, "$FILE_NAME.tmp")
        return try {
            val plaintext = SessionEnvelopeCodec.encode(session)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key())
            val encrypted = cipher.iv + cipher.doFinal(plaintext)
            require(encrypted.size <= MAX_FILE_BYTES)
            FileOutputStream(temporary).use { output ->
                output.write(VERSION)
                output.write(cipher.iv.size)
                output.write(encrypted)
                output.flush()
                output.fd.sync()
            }
            if (!temporary.renameTo(file)) {
                temporary.delete()
                false
            } else {
                true
            }
        } catch (_: Exception) {
            temporary.delete()
            false
        }
    }

    override fun clear() {
        file.delete()
        File(file.parentFile, "$FILE_NAME.tmp").delete()
    }

    private fun decrypt(envelope: ByteArray): ByteArray? {
        if (envelope.size < 3 || envelope[0].toInt() != VERSION) return null
        val ivSize = envelope[1].toInt()
        if (ivSize !in 12..16 || envelope.size <= 2 + ivSize) return null
        val iv = envelope.copyOfRange(2, 2 + ivSize)
        val ciphertext = envelope.copyOfRange(2 + ivSize, envelope.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
        return cipher.doFinal(ciphertext)
    }

    private fun key() = KeyStore.getInstance(ANDROID_KEYSTORE).run {
        load(null)
        (getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey ?: createKey()
    }

    private fun createKey() = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).run {
        init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(false)
                .build(),
        )
        generateKey()
    }.also { check(it.algorithm == KeyProperties.KEY_ALGORITHM_AES) }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "taskchute.native.auth.session.v1"
        const val FILE_NAME = "taskchute-session.bin"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val VERSION = 1
        const val MAX_FILE_BYTES = 24 * 1024L
    }
}
