package com.hedgetheapp.taskchute.ui

import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** The shared Material 3 logical-date picker used by Today and Daily. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskChuteDatePickerDialog(
    initialLogicalDate: String,
    onDismissRequest: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    val datePickerState = rememberDatePickerState(
        initialSelectedDateMillis = logicalDateToPickerMillis(initialLogicalDate),
    )
    DatePickerDialog(
        onDismissRequest = onDismissRequest,
        confirmButton = {
            TextButton(onClick = {
                datePickerState.selectedDateMillis?.let { onConfirm(pickerMillisToLogicalDate(it)) }
            }) { Text("決定") }
        },
        dismissButton = { TextButton(onClick = onDismissRequest) { Text("キャンセル") } },
    ) { DatePicker(state = datePickerState) }
}

private fun logicalDateToPickerMillis(logicalDate: String): Long =
    LocalDate.parse(logicalDate).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

private fun pickerMillisToLogicalDate(millis: Long): String =
    Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString()
