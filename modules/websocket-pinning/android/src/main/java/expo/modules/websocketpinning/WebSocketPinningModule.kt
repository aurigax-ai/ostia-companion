package expo.modules.websocketpinning

import android.util.Base64
import android.util.Log
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okio.ByteString
import okio.ByteString.Companion.decodeBase64
import java.security.MessageDigest
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

class WebSocketPinningModule : Module() {
  private var client: OkHttpClient? = null
  private var webSocket: WebSocket? = null
  private var expectedFingerprint: String? = null

  private fun createPinnedClient(fingerprint: String): OkHttpClient {
    val trustManager = object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}

      override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
        if (chain.isNullOrEmpty()) {
          throw java.security.cert.CertificateException("Empty certificate chain")
        }
        val cert = chain[0]
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(cert.encoded)
        val hashBase64 = Base64.encodeToString(hash, Base64.NO_WRAP)
        val computedFingerprint = "sha256/$hashBase64"

        Log.d("WebSocketPinning", "Expected Fingerprint: '$fingerprint'")
        Log.d("WebSocketPinning", "Computed Fingerprint: '$computedFingerprint'")

        if (computedFingerprint != fingerprint) {
          throw java.security.cert.CertificateException("Certificate fingerprint mismatch! Expected: $fingerprint, Got: $computedFingerprint")
        }
      }

      override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
    }

    val sslContext = SSLContext.getInstance("TLS")
    sslContext.init(null, arrayOf<TrustManager>(trustManager), java.security.SecureRandom())

    return OkHttpClient.Builder()
      .sslSocketFactory(sslContext.socketFactory, trustManager)
      .hostnameVerifier { _, _ -> true } // Pinned via fingerprint, ignore name (local LAN IP)
      .build()
  }

  override fun definition() = ModuleDefinition {
    Name("WebSocketPinning")

    Events("onOpen", "onMessage", "onClose", "onError")

    Function("connect") { url: String, fingerprint: String ->
      expectedFingerprint = fingerprint
      val activeClient = createPinnedClient(fingerprint)
      client = activeClient

      val request = Request.Builder().url(url).build()
      webSocket = activeClient.newWebSocket(request, object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
          Log.d("WebSocketPinning", "WebSocket onOpen: Connection successfully opened!")
          Handler(Looper.getMainLooper()).post {
            sendEvent("onOpen", mapOf<String, Any>())
          }
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
          Handler(Looper.getMainLooper()).post {
            sendEvent("onMessage", mapOf("type" to "text", "data" to text))
          }
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
          Handler(Looper.getMainLooper()).post {
            sendEvent("onMessage", mapOf("type" to "binary", "data" to bytes.base64()))
          }
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
          Log.d("WebSocketPinning", "WebSocket onClosing: code=$code, reason=$reason")
          Handler(Looper.getMainLooper()).post {
            sendEvent("onClose", mapOf("code" to code, "reason" to reason))
          }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
          Log.e("WebSocketPinning", "WebSocket onFailure: error=${t.message}", t)
          Handler(Looper.getMainLooper()).post {
            sendEvent("onError", mapOf("message" to (t.message ?: "Connection failure")))
            sendEvent("onClose", mapOf("code" to 1006, "reason" to (t.message ?: "Abnormal closure")))
          }
        }
      })
    }

    AsyncFunction("post") { url: String, bodyJson: String, fingerprint: String, promise: Promise ->
      try {
        val activeClient = createPinnedClient(fingerprint).newBuilder()
          .readTimeout(POST_TIMEOUT_SECONDS, java.util.concurrent.TimeUnit.SECONDS)
          .callTimeout(POST_TIMEOUT_SECONDS, java.util.concurrent.TimeUnit.SECONDS)
          .build()
        val mediaType = "application/json; charset=utf-8".toMediaType()
        val requestBody = bodyJson.toRequestBody(mediaType)
        val request = Request.Builder().url(url).post(requestBody).build()

        activeClient.newCall(request).enqueue(object : Callback {
          override fun onFailure(call: Call, e: java.io.IOException) {
            promise.reject("POST_FAILED", e.message ?: "Network request failed", e)
          }

          override fun onResponse(call: Call, response: Response) {
            if (!response.isSuccessful) {
              promise.reject("POST_HTTP_ERROR", "HTTP status code: ${response.code}", null)
              return
            }
            val body = response.body?.string() ?: ""
            promise.resolve(body)
          }
        })
      } catch (e: Exception) {
        promise.reject("POST_ERROR", e.message ?: "Error setting up HTTP client", e)
      }
    }

    Function("send") { message: String ->
      webSocket?.send(message)
    }

    Function("sendBinary") { base64String: String ->
      val bytes = base64String.decodeBase64()
      if (bytes != null) {
        webSocket?.send(bytes)
      }
    }

    Function("close") {
      webSocket?.close(1000, "Normal closure")
    }
  }
}

private const val POST_TIMEOUT_SECONDS = 130L
