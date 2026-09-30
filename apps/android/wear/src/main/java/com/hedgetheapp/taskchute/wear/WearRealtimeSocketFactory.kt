package com.hedgetheapp.taskchute.wear

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

internal class OkHttpWearRealtimeSocketFactory(
    private val baseUrl: String,
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build(),
) : WearRealtimeSocketFactory {
    override fun open(cookieHeader: String, listener: WearRealtimeSocketListener): WearRealtimeSocket {
        require(cookieHeader.isNotBlank())
        val socket = object : WearRealtimeSocket {
            @Volatile var webSocket: WebSocket? = null
            override fun close() {
                webSocket?.close(1000, "foreground stopped")
            }
        }
        socket.webSocket = client.newWebSocket(
            Request.Builder()
                .url(webSocketUrl(baseUrl))
                .header("Cookie", cookieHeader)
                .header("X-TaskChute-Realtime-Client", "android")
                .build(),
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) = listener.onOpen(socket)
                override fun onMessage(webSocket: WebSocket, text: String) = listener.onMessage(socket, text)
                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(code, reason)
                }
                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = listener.onClosed(socket)
                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) =
                    listener.onFailure(socket, response?.code)
            },
        )
        return socket
    }

    private fun webSocketUrl(rawBaseUrl: String): String {
        val normalized = rawBaseUrl.removeSuffix("/")
        val websocketBase = when {
            normalized.startsWith("https://") -> "wss://${normalized.removePrefix("https://")}"
            normalized.startsWith("http://") -> "ws://${normalized.removePrefix("http://")}"
            else -> error("TaskChute base URL must use http or https")
        }
        return "$websocketBase/api/v1/realtime"
    }
}
