package com.hedgetheapp.taskchute.wear

import android.content.Context
import java.io.File
import java.io.FileOutputStream

internal object WearInstallationIdStore {
    private const val FILE_NAME = "taskchute-wear-installation-id"
    private val uuidV7Pattern = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")

    @Synchronized
    fun get(context: Context): String {
        val file = File(context.noBackupFilesDir, FILE_NAME)
        file.takeIf(File::isFile)?.readText()?.trim()?.takeIf(::isUuidV7)?.let { return it }

        val installationId = WearUUIDv7.next()
        val temporary = File(file.parentFile, "$FILE_NAME.tmp")
        FileOutputStream(temporary).use { output ->
            output.write(installationId.toByteArray(Charsets.US_ASCII))
            output.fd.sync()
        }
        if (file.exists()) file.delete()
        check(temporary.renameTo(file)) { "Unable to persist Wear installation identity" }
        return installationId
    }

    internal fun isUuidV7(value: String): Boolean = uuidV7Pattern.matches(value)
}
