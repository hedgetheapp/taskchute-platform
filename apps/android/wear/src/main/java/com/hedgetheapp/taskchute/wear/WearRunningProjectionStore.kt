package com.hedgetheapp.taskchute.wear

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.time.Instant
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

internal data class WearRunningProjectionSnapshot(
    val taskTitle: String,
    val startedAt: Instant,
    val estimateSeconds: Int?,
)

internal interface WearRunningProjectionStore {
    fun load(): WearRunningProjectionSnapshot?
    fun save(snapshot: WearRunningProjectionSnapshot): Boolean
    fun clear()
}

internal object WearRunningProjectionFileLock {
    val monitor = Any()
}

internal object WearRunningProjectionCodec {
    private const val MAGIC = 0x54434C31
    private const val MAX_TITLE_LENGTH = 48
    private const val MAX_BYTES = 512

    fun encode(snapshot: WearRunningProjectionSnapshot): ByteArray? = runCatching {
        require(valid(snapshot))
        ByteArrayOutputStream().also { bytes ->
            DataOutputStream(bytes).use { output ->
                output.writeInt(MAGIC)
                output.writeUTF(snapshot.taskTitle)
                output.writeLong(snapshot.startedAt.epochSecond)
                output.writeInt(snapshot.startedAt.nano)
                output.writeBoolean(snapshot.estimateSeconds != null)
                snapshot.estimateSeconds?.let(output::writeInt)
            }
        }.toByteArray().also { require(it.size <= MAX_BYTES) }
    }.getOrNull()

    fun decode(bytes: ByteArray): WearRunningProjectionSnapshot? = runCatching {
        require(bytes.isNotEmpty() && bytes.size <= MAX_BYTES)
        DataInputStream(ByteArrayInputStream(bytes)).use { input ->
            require(input.readInt() == MAGIC)
            val title = input.readUTF()
            val startedAt = Instant.ofEpochSecond(input.readLong(), input.readInt().toLong())
            val estimate = if (input.readBoolean()) input.readInt() else null
            require(input.available() == 0)
            WearRunningProjectionSnapshot(title, startedAt, estimate).also { require(valid(it)) }
        }
    }.getOrNull()

    private fun valid(snapshot: WearRunningProjectionSnapshot): Boolean =
        snapshot.taskTitle.isNotBlank() &&
            snapshot.taskTitle.length <= MAX_TITLE_LENGTH &&
            snapshot.taskTitle == snapshot.taskTitle.trim() &&
            snapshot.taskTitle.none { it.isISOControl() } &&
            (snapshot.estimateSeconds == null || snapshot.estimateSeconds > 0)
}

internal class WearEncryptedRunningProjectionStore(context: Context) : WearRunningProjectionStore {
    private val file = AtomicFile(File(context.noBackupFilesDir, FILE_NAME))

    override fun load(): WearRunningProjectionSnapshot? = synchronized(WearRunningProjectionFileLock.monitor) {
        try {
            when {
                !file.baseFile.isFile -> null
                file.baseFile.length() > MAX_ENVELOPE_BYTES -> null.also { file.delete() }
                else -> {
                    val envelope = file.openRead().use { it.readBytes() }
                    decode(envelope)?.let(WearRunningProjectionCodec::decode)
                        ?: null.also { file.delete() }
                }
            }
        } catch (_: Exception) {
            file.delete()
            null
        }
    }

    override fun save(snapshot: WearRunningProjectionSnapshot): Boolean = synchronized(WearRunningProjectionFileLock.monitor) {
        val plaintext = WearRunningProjectionCodec.encode(snapshot) ?: return@synchronized false
        var stream: java.io.FileOutputStream? = null
        try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key())
            val ciphertext = cipher.doFinal(plaintext)
            require(cipher.iv.size in 12..16 && ciphertext.size <= MAX_ENVELOPE_BYTES)
            val startedWrite = file.startWrite()
            stream = startedWrite
            val output = DataOutputStream(startedWrite)
            output.writeByte(VERSION)
            output.writeByte(cipher.iv.size)
            output.write(cipher.iv)
            output.write(ciphertext)
            output.flush()
            startedWrite.fd.sync()
            file.finishWrite(startedWrite)
            stream = null
            true
        } catch (_: Exception) {
            stream?.let(file::failWrite)
            false
        }
    }

    override fun clear() = synchronized(WearRunningProjectionFileLock.monitor) { file.delete() }

    private fun decode(envelope: ByteArray): ByteArray? = runCatching {
        require(envelope.size in 15..MAX_ENVELOPE_BYTES)
        DataInputStream(ByteArrayInputStream(envelope)).use { input ->
            require(input.readUnsignedByte() == VERSION)
            val ivSize = input.readUnsignedByte()
            require(ivSize in 12..16 && input.available() > ivSize)
            val iv = ByteArray(ivSize).also(input::readFully)
            val ciphertext = ByteArray(input.available()).also(input::readFully)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            cipher.doFinal(ciphertext)
        }
    }.getOrNull()

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
        const val KEY_ALIAS = "taskchute.wear.complication.lkg.v1"
        const val FILE_NAME = "taskchute-wear-running-projection.bin"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val VERSION = 1
        const val MAX_ENVELOPE_BYTES = 1024
    }
}
