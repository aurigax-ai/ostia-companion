package expo.modules.phonecontrol

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RequestHandlerTest {
  private class FakeScreen : PhoneScreen {
    var asked: Int? = null
    var streamed: Pair<Int, Int>? = null
    var stopped = false
    var frame: Frame? = Frame(10, 20, 100, 200, byteArrayOf(9), false)

    override fun capture(maxSide: Int): Frame? {
      asked = maxSide
      return frame
    }

    override fun foreground() = Foreground("com.example", "Example")

    override fun stream(fps: Int, maxSide: Int) {
      streamed = fps to maxSide
    }

    override fun stopFromDesktop() {
      stopped = true
    }
  }

  private fun code(reply: Reply) = (reply as Reply.Fail).error.message

  @Test
  fun PHC_C4_captureAnswersAJpegWithTheDisplaySize() {
    val screen = FakeScreen()
    val reply = RequestHandler("view", screen).handle("phone.capture", JSONObject().put("maxSide", 640))
    val result = (reply as Reply.Ok).result
    assertEquals(640, screen.asked)
    assertEquals(100, result.getInt("screenWidth"))
    assertEquals("image/jpeg", result.getString("mime"))
  }

  @Test
  fun captureWithoutMaxSideUsesTheLimitAndRefusesNonNumbers() {
    val screen = FakeScreen()
    RequestHandler("view", screen).handle("phone.capture", JSONObject())
    assertEquals(MAX_CAPTURE_SIDE, screen.asked)
    assertEquals("bad-params", code(RequestHandler("view", screen).handle("phone.capture", JSONObject().put("maxSide", "big"))))
  }

  @Test
  fun captureBeforeTheFirstFrameSaysSo() {
    val screen = FakeScreen().apply { frame = null }
    assertEquals("no-frame", code(RequestHandler("view", screen).handle("phone.capture", JSONObject())))
  }

  @Test
  fun PHC_C17_viewLevelRefusesEveryInputRequest() {
    val handler = RequestHandler("view", FakeScreen())
    for (method in listOf("phone.tap", "phone.swipe", "phone.type", "phone.key", "phone.launch")) {
      val reply = handler.handle(method, JSONObject())
      assertEquals(SCREEN_ERROR, (reply as Reply.Fail).error.code)
      assertEquals("view-only", reply.error.message)
    }
  }

  @Test
  fun streamTakesZeroToFiveFramesASecond() {
    val screen = FakeScreen()
    val handler = RequestHandler("view", screen)
    assertTrue(handler.handle("phone.stream", JSONObject().put("fps", 5).put("maxSide", 800)) is Reply.Ok)
    assertEquals(5 to 800, screen.streamed)
    assertEquals("bad-params", code(handler.handle("phone.stream", JSONObject().put("fps", 6))))
    assertEquals("bad-params", code(handler.handle("phone.stream", JSONObject())))
  }

  @Test
  fun stopEndsTheSessionFromTheDesktop() {
    val screen = FakeScreen()
    RequestHandler("view", screen).handle("phone.stop", JSONObject())
    assertTrue(screen.stopped)
  }

  @Test
  fun unknownMethodsAreNotFound() {
    val reply = RequestHandler("view", FakeScreen()).handle("phone.unknown", JSONObject())
    assertEquals(METHOD_NOT_FOUND, (reply as Reply.Fail).error.code)
  }

  @Test
  fun sessionConfigTakesOnlyKnownLimitsLevelsAndPinnedTargets() {
    val good = JSONObject()
      .put("host", "100.64.0.2").put("port", 8722.0).put("fingerprint", "sha256/abc").put("deviceToken", "t")
      .put("sessionId", "w1").put("limitSec", 900).put("level", "view")
    assertEquals(900, SessionConfig.parse(good)?.limitSec)
    assertNull(SessionConfig.parse(JSONObject(good.toString()).put("limitSec", 901)))
    assertNull(SessionConfig.parse(JSONObject(good.toString()).put("level", "root")))
    assertNull(SessionConfig.parse(JSONObject(good.toString()).put("fingerprint", "md5/abc")))
    assertNull(SessionConfig.parse(JSONObject(good.toString()).put("sessionId", "")))
  }
}
