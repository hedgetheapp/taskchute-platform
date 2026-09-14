package com.hedgetheapp.taskchute.realtime

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

internal class OkHttpRealtimeSocketFactory(
    private val baseUrl: String,
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build(),
) : RealtimeSocketFactory {
    override fun open(cookieHeader: String, listener: RealtimeSocketListener): RealtimeSocket {
        lateinit var adapter: RealtimeSocket
        val webSocket = client.newWebSocket(
            Request.Builder()
                .url(webSocketUrl(baseUrl))
                .header("Cookie", cookieHeader)
                .header("X-TaskChute-Realtime-Client", "android")
                .build(),
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) = listener.onOpen(adapter)

                override fun onMessage(webSocket: WebSocket, text: String) = listener.onMessage(adapter, text)

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(code, reason)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = listener.onClosed(adapter)

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) =
                    listener.onFailure(adapter, response?.code)
            },
        )
        adapter = object : RealtimeSocket {
            override fun close() {
                webSocket.close(1000, "client stopped")
            }
        }
        return adapter
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
