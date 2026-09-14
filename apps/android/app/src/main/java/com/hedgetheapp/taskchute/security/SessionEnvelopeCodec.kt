package com.hedgetheapp.taskchute.security

import com.hedgetheapp.taskchute.auth.SessionCredential
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.IOException

object SessionEnvelopeCodec {
    private val MAGIC = byteArrayOf('T'.code.toByte(), 'C'.code.toByte(), 'A'.code.toByte(), 'S'.code.toByte())
    private const val VERSION = 1
    private const val MAX_ENVELOPE_BYTES = 16 * 1024
    private const val MAX_COOKIES = 32
    private const val MAX_NAME_BYTES = 256
    private const val MAX_VALUE_BYTES = 4096

    fun encode(session: SessionCredential): ByteArray {
        val output = ByteArrayOutputStream()
        DataOutputStream(output).use { data ->
            data.write(MAGIC)
            data.writeByte(VERSION)
            val entries = session.cookies.toSortedMap().entries
            require(entries.isNotEmpty() && entries.size <= MAX_COOKIES) { "invalid cookie count" }
            data.writeInt(entries.size)
            for ((name, value) in entries) {
                val nameBytes = name.toByteArray(Charsets.UTF_8)
                val valueBytes = value.toByteArray(Charsets.UTF_8)
                require(nameBytes.isNotEmpty() && nameBytes.size <= MAX_NAME_BYTES) { "invalid cookie name" }
                require(valueBytes.size <= MAX_VALUE_BYTES) { "invalid cookie value" }
                data.writeInt(nameBytes.size)
                data.write(nameBytes)
                data.writeInt(valueBytes.size)
                data.write(valueBytes)
            }
        }
        return output.toByteArray().also { require(it.size <= MAX_ENVELOPE_BYTES) { "session envelope too large" } }
    }

    fun decode(bytes: ByteArray): SessionCredential? {
        if (bytes.isEmpty() || bytes.size > MAX_ENVELOPE_BYTES) return null
        return try {
            DataInputStream(ByteArrayInputStream(bytes)).use { data ->
                val magic = ByteArray(MAGIC.size)
                data.readFully(magic)
                if (!magic.contentEquals(MAGIC) || data.readUnsignedByte() != VERSION) return null
                val count = data.readInt()
                if (count !in 1..MAX_COOKIES) return null
                val cookies = linkedMapOf<String, String>()
                repeat(count) {
                    val name = readString(data, MAX_NAME_BYTES) ?: return null
                    val value = readString(data, MAX_VALUE_BYTES) ?: return null
                    if (cookies.put(name, value) != null) return null
                }
                if (data.available() != 0) return null
                SessionCredential(cookies.toSortedMap())
            }
        } catch (_: IOException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    private fun readString(data: DataInputStream, maxBytes: Int): String? {
        val size = data.readInt()
        if (size !in 1..maxBytes) return null
        val bytes = ByteArray(size)
        data.readFully(bytes)
        return bytes.toString(Charsets.UTF_8).takeIf { it.none { character -> character == '\u0000' || character == '\r' || character == '\n' } }
    }
}
