package com.hedgetheapp.taskchute.wear

import org.json.JSONObject

internal data class WearStartRequest(
    val operationId: String,
    val entryId: String,
    val executionId: String,
    val expectedPlacementRevision: Int,
) {
    fun toJson(): String = JSONObject()
        .put("operation_id", operationId)
        .put("entry_id", entryId)
        .put("execution_id", executionId)
        .put("expected_placement_revision", expectedPlacementRevision)
        .toString()
}

internal data class WearCompleteRequest(
    val operationId: String,
    val entryId: String,
    val executionId: String,
) {
    fun toJson(): String = JSONObject()
        .put("operation_id", operationId)
        .put("entry_id", entryId)
        .put("execution_id", executionId)
        .toString()
}

internal fun newWearStartRequest(entryId: String, placementRevision: Int): WearStartRequest =
    WearStartRequest(
        operationId = WearUUIDv7.next(),
        entryId = entryId,
        executionId = WearUUIDv7.next(),
        expectedPlacementRevision = placementRevision,
    )

internal fun newWearCompleteRequest(entryId: String, executionId: String): WearCompleteRequest =
    WearCompleteRequest(
        operationId = WearUUIDv7.next(),
        entryId = entryId,
        executionId = executionId,
    )
