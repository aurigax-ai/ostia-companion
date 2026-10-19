package expo.modules.phonecontrol

import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString.Companion.toByteString
import org.json.JSONObject

data class LinkTarget(val host: String, val port: Int, val fingerprint: String, val deviceToken: String)

interface LinkListener {
  fun onLinked(screenId: String)
  fun onRefused(reason: String)
  fun onRequest(request: Incoming.Request)
  fun onEvent(event: Incoming.Event)
  fun onClosed(code: Int)
}

class ScreenLink(
  private val target: LinkTarget,
  private val start: () -> StartParams,
  private val listener: LinkListener,
  private val sockets: () -> WebSocket.Factory = { pinnedClient(target.fingerprint) },
) : Link {
  @Volatile
  private var socket: WebSocket? = null
  @Volatile
  private var linked = false
  @Volatile
  private var closed = false
  private var nextId = FIRST_CALL_ID
  private val calls = java.util.concurrent.ConcurrentHashMap<Int, (Incoming.Response) -> Unit>()

  override fun open() {
    val request = Request.Builder().url("wss://${target.host}:${target.port}/ws").build()
    socket = sockets().newWebSocket(request, object : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) {
        webSocket.send(LinkProtocol.hello(HELLO_ID, target.deviceToken))
      }

      override fun onMessage(webSocket: WebSocket, text: String) {
        handle(LinkProtocol.parse(text))
      }

      override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
        webSocket.close(code, null)
        finish(code)
      }

      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
        finish(code)
      }

      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        if (!linked) refuse("unreachable") else finish(LINK_LOST)
      }
    })
  }

  private fun handle(message: Incoming) {
    when (message) {
      is Incoming.Response -> if (message.id >= FIRST_CALL_ID) calls.remove(message.id)?.invoke(message) else when (message.id) {
        HELLO_ID ->
          if (message.error != null) refuse(if (message.error.code == UNAUTHENTICATED) "unauthenticated" else message.error.message)
          else socket?.send(LinkProtocol.start(START_ID, start()))
        START_ID -> {
          val screenId = message.result?.optString("screenId", "") ?: ""
          when {
            message.error != null -> refuse(if (message.error.code == METHOD_NOT_FOUND) "desktop-too-old" else message.error.message)
            screenId.isEmpty() -> refuse("bad-answer")
            else -> {
              linked = true
              listener.onLinked(screenId)
            }
          }
        }
      }
      is Incoming.Request -> if (linked) listener.onRequest(message)
      is Incoming.Event -> listener.onEvent(message)
      Incoming.Invalid -> Unit
    }
  }

  override fun call(method: String, params: JSONObject, answer: (Incoming.Response) -> Unit) {
    val id = synchronized(this) { nextId++ }
    calls[id] = answer
    socket?.send(LinkProtocol.request(id, method, params))
  }

  override fun reply(id: Any, result: JSONObject) {
    socket?.send(LinkProtocol.result(id, result))
  }

  override fun fail(id: Any, error: RpcError) {
    socket?.send(LinkProtocol.error(id, error))
  }

  override fun send(text: String) {
    socket?.send(text)
  }

  override fun sendFrame(bytes: ByteArray): Boolean {
    val open = socket ?: return false
    if (open.queueSize() + bytes.size > MAX_QUEUED_BYTES) return false
    return open.send(bytes.toByteString())
  }

  override fun close() {
    closed = true
    socket?.close(NORMAL_CLOSE, "session ended")
  }

  private fun refuse(reason: String) {
    if (closed) return
    closed = true
    socket?.close(NORMAL_CLOSE, reason)
    listener.onRefused(reason)
  }

  private fun finish(code: Int) {
    if (closed) return
    closed = true
    listener.onClosed(code)
  }

  companion object {
    const val HELLO_ID = 1
    const val START_ID = 2
    const val FIRST_CALL_ID = 10
    const val NORMAL_CLOSE = 1000
    const val LINK_LOST = 1006
    const val MAX_QUEUED_BYTES = 2L * 1024 * 1024
  }
}
