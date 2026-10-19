package expo.modules.phonecontrol

import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScreenLinkTest {
  private class Socket(var queued: Long = 0) : WebSocket {
    val texts = mutableListOf<String>()
    var binaries = 0

    override fun request(): Request = Request.Builder().url("https://desk.ts.net/ws").build()
    override fun queueSize() = queued
    override fun send(text: String): Boolean {
      texts.add(text)
      return true
    }

    override fun send(bytes: ByteString): Boolean {
      binaries++
      queued += bytes.size
      return true
    }

    override fun close(code: Int, reason: String?) = true
    override fun cancel() = Unit
  }

  private class Listener : LinkListener {
    var screenId: String? = null
    var refused: String? = null
    override fun onLinked(screenId: String) {
      this.screenId = screenId
    }

    override fun onRefused(reason: String) {
      refused = reason
    }

    override fun onRequest(request: Incoming.Request) = Unit
    override fun onEvent(event: Incoming.Event) = Unit
    override fun onClosed(code: Int) = Unit
  }

  private val socket = Socket()
  private var events: WebSocketListener? = null
  private val listener = Listener()
  private val link = ScreenLink(
    LinkTarget("desk.ts.net", 7443, "sha256/x", "tok"),
    { StartParams("s1", "api", 1080, 2400, 2.75f, 0, "control", 300, 9, 0, null) },
    listener,
  ) {
    WebSocket.Factory { _, listener ->
      events = listener
      socket
    }
  }

  @Test
  fun helloThenStartMakeTheSocketTheLink() {
    link.open()
    events!!.onOpen(socket, okhttp3.Response.Builder().request(socket.request()).protocol(okhttp3.Protocol.HTTP_1_1).code(101).message("").build())
    assertEquals("hello", JSONObject(socket.texts[0]).getString("method"))
    events!!.onMessage(socket, """{"jsonrpc":"2.0","id":1,"result":{}}""")
    assertEquals("screen.start", JSONObject(socket.texts[1]).getString("method"))
    events!!.onMessage(socket, """{"jsonrpc":"2.0","id":2,"result":{"screenId":"scr-1"}}""")
    assertEquals("scr-1", listener.screenId)
  }

  @Test
  fun anOldDesktopIsRefusedAsTooOld() {
    link.open()
    events!!.onMessage(socket, """{"jsonrpc":"2.0","id":1,"result":{}}""")
    events!!.onMessage(socket, """{"jsonrpc":"2.0","id":2,"error":{"code":-32601,"message":"method not found"}}""")
    assertEquals("desktop-too-old", listener.refused)
  }

  @Test
  fun aFrameIsSkippedWhileTheSocketQueueIsFull() {
    link.open()
    assertTrue(link.sendFrame(ByteArray(1024)))
    socket.queued = ScreenLink.MAX_QUEUED_BYTES
    assertFalse(link.sendFrame(ByteArray(1024)))
    assertEquals(1, socket.binaries)
  }
}
