package com.hedgetheapp.taskchute.wear

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

internal data class WearCookieSession(val cookies: Map<String, String>)

internal interface WearSessionStore {
    fun load(): WearCookieSession?
    fun save(session: WearCookieSession): Boolean
    fun clear()
}

internal object WearCookieCodec {
    fun encode(session: WearCookieSession): ByteArray {
        require(session.cookies.isNotEmpty() && session.cookies.size <= 32)
        val bytes = ByteArrayOutputStream()
        DataOutputStream(bytes).use { output ->
            output.writeInt(session.cookies.size)
            session.cookies.toSortedMap().forEach { (name, value) ->
                require(validName(name) && value.isNotBlank() && value.none { it == '\r' || it == '\n' })
                output.writeUTF(name)
                output.writeUTF(value)
            }
        }
        return bytes.toByteArray().also { require(it.size <= MAX_BYTES) }
    }

    fun decode(bytes: ByteArray): WearCookieSession? = runCatching {
        require(bytes.isNotEmpty() && bytes.size <= MAX_BYTES)
        DataInputStream(ByteArrayInputStream(bytes)).use { input ->
            val count = input.readInt()
            require(count in 1..32)
            val cookies = linkedMapOf<String, String>()
            repeat(count) {
                val name = input.readUTF()
                val value = input.readUTF()
                require(validName(name) && value.isNotBlank() && value.none { it == '\r' || it == '\n' })
                require(cookies.put(name, value) == null)
            }
            require(input.available() == 0)
            WearCookieSession(cookies)
        }
    }.getOrNull()

    private fun validName(name: String): Boolean = name.isNotBlank() && name.all {
        it.isLetterOrDigit() || it in "!#$%&'*+-.^_`|~"
    }

    private const val MAX_BYTES = 24 * 1024
}

internal class WearEncryptedSessionStore(private val context: Context) : WearSessionStore {
    private val file = File(context.noBackupFilesDir, FILE_NAME)

    override fun load(): WearCookieSession? = try {
        if (!file.isFile || file.length() > MAX_ENVELOPE_BYTES) return null
        val envelope = FileInputStream(file).use { it.readBytes() }
        decrypt(envelope)?.let(WearCookieCodec::decode) ?: run { clear(); null }
    } catch (_: Exception) {
        clear()
        null
    }

    override fun save(session: WearCookieSession): Boolean {
        val temporary = File(file.parentFile, "$FILE_NAME.tmp")
        return try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key())
            val encrypted = cipher.iv + cipher.doFinal(WearCookieCodec.encode(session))
            require(encrypted.size <= MAX_ENVELOPE_BYTES - 2)
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
            } else true
        } catch (_: Exception) {
            temporary.delete()
            false
        }
    }

    override fun clear() {
        file.delete()
        File(file.parentFile, "$FILE_NAME.tmp").delete()
        // Running task presentation is scoped to the authenticated Watch session.
        WearEncryptedRunningProjectionStore(context).clear()
    }

    private fun decrypt(envelope: ByteArray): ByteArray? {
        if (envelope.size < 3 || envelope.size > MAX_ENVELOPE_BYTES || envelope[0].toInt() != VERSION) return null
        val ivSize = envelope[1].toInt()
        if (ivSize !in 12..16 || envelope.size <= 2 + ivSize) return null
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, envelope.copyOfRange(2, 2 + ivSize)))
        return cipher.doFinal(envelope.copyOfRange(2 + ivSize, envelope.size))
    }

    private fun key() = KeyStore.getInstance(ANDROID_KEYSTORE).run {
        load(null)
        (getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey ?: createKey()
    }

    private fun createKey() = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).run {
        init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(false)
            .build())
        generateKey()
    }.also { check(it.algorithm == KeyProperties.KEY_ALGORITHM_AES) }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "taskchute.wear.auth.session.v1"
        const val FILE_NAME = "taskchute-wear-session.bin"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val VERSION = 1
        const val MAX_ENVELOPE_BYTES = 24 * 1024
    }
}
