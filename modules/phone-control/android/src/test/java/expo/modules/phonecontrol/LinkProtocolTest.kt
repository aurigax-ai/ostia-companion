package expo.modules.phonecontrol

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer

class LinkProtocolTest {
  private val frame = Frame(800, 1600, 1080, 2160, byteArrayOf(1, 2, 3), false)

  @Test
  fun PHA_C12_startCarriesTheRequestItAnswersOnlyWhenThereIsOne() {
    val start = StartParams("s1", "api", 1080, 2400, 2.75f, 0, "control", 300, 9, 0, "claude", null)
    assertTrue(!JSONObject(LinkProtocol.start(2, start)).getJSONObject("params").has("requestId"))
    val answered = JSONObject(LinkProtocol.start(2, start.copy(requestId = "req-7"))).getJSONObject("params")
    assertEquals("req-7", answered.getString("requestId"))
    assertEquals("claude", answered.getString("agent"))
  }

  @Test
  fun parsesDesktopRequestsWithTheirIds() {
    val message = LinkProtocol.parse("""{"jsonrpc":"2.0","id":"r7","method":"phone.capture","params":{"maxSide":800}}""")
    message as Incoming.Request
    assertEquals("r7", message.id)
    assertEquals("phone.capture", message.method)
    assertEquals(800, message.params.getInt("maxSide"))
  }

  @Test
  fun parsesResponsesErrorsAndEvents() {
    val error = LinkProtocol.parse("""{"jsonrpc":"2.0","id":2,"error":{"code":-32601,"message":"method not found"}}""")
    assertEquals(METHOD_NOT_FOUND, (error as Incoming.Response).error?.code)
    val event = LinkProtocol.parse("""{"jsonrpc":"2.0","method":"event","params":{"type":"ask.created","payload":{"askId":"a"}}}""")
    assertEquals("ask.created", (event as Incoming.Event).type)
    assertTrue(LinkProtocol.parse("not json") is Incoming.Invalid)
    assertTrue(LinkProtocol.parse("""{"jsonrpc":"2.0","id":null,"method":"phone.tap"}""") is Incoming.Invalid)
  }

  @Test
  fun framesCarryTypeHeaderLengthHeaderAndJpeg() {
    val bytes = LinkProtocol.frameBytes(4, frame)
    assertEquals(FRAME_SCREEN, bytes[0].toInt())
    val length = ByteBuffer.wrap(bytes, 1, 4).int
    val header = JSONObject(String(bytes, 5, length, Charsets.UTF_8))
    assertEquals(4, header.getLong("seq"))
    assertEquals(1080, header.getInt("screenWidth"))
    assertArrayEquals(byteArrayOf(1, 2, 3), bytes.copyOfRange(5 + length, bytes.size))
  }

  @Test
  fun captureResultsAreBase64JpegWithTheDisplaySize() {
    val result = LinkProtocol.captureResult(frame, Foreground("com.example", "Example"))
    assertEquals("image/jpeg", result.getString("mime"))
    assertEquals("AQID", result.getString("data"))
    assertEquals(2160, result.getInt("screenHeight"))
    assertEquals("com.example", result.getJSONObject("foreground").getString("package"))
  }

  @Test
  fun scalesTheLongestSideAndKeepsSmallerScreens() {
    assertEquals(800 to 1600, scaledSize(1080, 2160, 1600))
    assertEquals(720 to 1280, scaledSize(720, 1280, 1600))
    assertEquals(MAX_CAPTURE_SIDE, LinkProtocol.clampSide(99999))
    assertEquals(MIN_CAPTURE_SIDE, LinkProtocol.clampSide(1))
  }

  @Test
  fun namesWhyTheDesktopClosedTheLink() {
    assertEquals("revoked", closeReason(4003))
    assertEquals("time-limit", closeReason(4005))
    assertEquals("no-controller", closeReason(4006))
    assertEquals("link-closed", closeReason(1006))
  }

  @Test
  fun readsPointsOnlyAsTwoNumbers() {
    assertArrayEquals(intArrayOf(3, 4), LinkProtocol.point(JSONArray("[3,4]")))
    assertNull(LinkProtocol.point(JSONArray("[3]")))
    assertNull(LinkProtocol.point(JSONArray("""["3",4]""")))
  }
}
