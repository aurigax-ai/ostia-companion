package expo.modules.phonecontrol

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RequestHandlerTest {
  private class FakeScreen(var refusal: RpcError? = null) : PhoneScreen {
    var asked: Int? = null
    var streamed: Pair<Int, Int>? = null
    var stopped = false
    var tapped: List<Int>? = null
    var swiped: Pair<List<Int>, List<Int>>? = null
    var typed: String? = null
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

    var leaving: Boolean? = null

    override fun inputRefusal(leaving: Boolean): RpcError? {
      this.leaving = leaving
      return refusal
    }

    override fun readRefusal() = refusal

    override fun tap(x: Int, y: Int, count: Int, holdMs: Int, done: (Reply) -> Unit) {
      tapped = listOf(x, y, count, holdMs)
      done(Reply.Ok(JSONObject()))
    }

    override fun swipe(from: IntArray, to: IntArray, durationMs: Int, done: (Reply) -> Unit) {
      swiped = from.toList() to to.toList() + durationMs
      done(Reply.Ok(JSONObject()))
    }

    override fun type(text: String): Reply {
      typed = text
      return Reply.Ok(JSONObject())
    }

    override fun key(key: String, done: (Reply) -> Unit) = done(Reply.Ok(JSONObject().put("key", key)))

    override fun launch(packageName: String) = Reply.Ok(JSONObject().put("package", packageName))

    override fun apps() = Reply.Ok(JSONObject().put("apps", JSONArray()))

    override fun tree() = Reply.Ok(JSONObject().put("nodes", JSONArray()))
  }

  private fun run(screen: PhoneScreen, method: String, params: JSONObject = JSONObject()): Reply {
    var reply: Reply? = null
    RequestHandler(screen).handle(method, params) { reply = it }
    return reply!!
  }

  private fun code(reply: Reply) = (reply as Reply.Fail).error.message

  @Test
  fun PHC_C4_captureAnswersAJpegWithTheDisplaySize() {
    val screen = FakeScreen()
    val result = (run(screen, "phone.capture", JSONObject().put("maxSide", 640)) as Reply.Ok).result
    assertEquals(640, screen.asked)
    assertEquals(100, result.getInt("screenWidth"))
    assertEquals("image/jpeg", result.getString("mime"))
  }

  @Test
  fun captureWithoutMaxSideUsesTheLimitAndRefusesNonNumbers() {
    val screen = FakeScreen()
    run(screen, "phone.capture")
    assertEquals(MAX_CAPTURE_SIDE, screen.asked)
    assertEquals("bad-params", code(run(screen, "phone.capture", JSONObject().put("maxSide", "big"))))
  }

  @Test
  fun captureBeforeTheFirstFrameSaysSo() {
    assertEquals("no-frame", code(run(FakeScreen().apply { frame = null }, "phone.capture")))
  }

  @Test
  fun PHC_C17_aRefusalStopsEveryInputRequestBeforeItReachesTheScreen() {
    val screen = FakeScreen(LinkProtocol.screenError("view-only"))
    for (method in RequestHandler.INPUT_METHODS) assertEquals("view-only", code(run(screen, method, JSONObject().put("x", 1).put("y", 1))))
    assertNull(screen.tapped)
  }

  @Test
  fun PHC_C9_aPauseAnswersWithItsReason() {
    val reply = run(FakeScreen(LinkProtocol.screenError("paused", "human-touch")), "phone.tap", JSONObject().put("x", 1).put("y", 2))
    assertEquals("paused", code(reply))
    assertEquals("human-touch", (reply as Reply.Fail).error.data?.getString("reason"))
  }

  @Test
  fun tapTakesWholeCoordinatesAndDefaultsToOneShortTap() {
    val screen = FakeScreen()
    assertTrue(run(screen, "phone.tap", JSONObject().put("x", 10).put("y", 20)) is Reply.Ok)
    assertEquals(listOf(10, 20, 1, 0), screen.tapped)
    assertEquals("bad-params", code(run(screen, "phone.tap", JSONObject().put("x", 1.5).put("y", 2))))
    assertEquals("bad-params", code(run(screen, "phone.tap", JSONObject().put("x", 1).put("y", 2).put("count", 3))))
    assertEquals("bad-params", code(run(screen, "phone.tap", JSONObject().put("x", -1).put("y", 2))))
  }

  @Test
  fun swipeTakesTwoPointsAndADuration() {
    val screen = FakeScreen()
    run(screen, "phone.swipe", JSONObject().put("from", JSONArray("[1,2]")).put("to", JSONArray("[3,4]")))
    assertEquals(listOf(1, 2) to listOf(3, 4, 300), screen.swiped)
    assertEquals("bad-params", code(run(screen, "phone.swipe", JSONObject().put("from", JSONArray("[1]")).put("to", JSONArray("[3,4]")))))
    assertEquals("bad-params", code(run(screen, "phone.swipe", JSONObject().put("from", JSONArray("[1,2]")).put("to", JSONArray("[3,4]")).put("durationMs", 10))))
  }

  @Test
  fun typeKeyAndLaunchCheckTheirArguments() {
    val screen = FakeScreen()
    run(screen, "phone.type", JSONObject().put("text", "hello"))
    assertEquals("hello", screen.typed)
    assertEquals("bad-params", code(run(screen, "phone.type", JSONObject().put("text", "x".repeat(4001)))))
    assertEquals("bad-params", code(run(screen, "phone.key", JSONObject().put("key", "power"))))
    assertTrue(run(screen, "phone.key", JSONObject().put("key", "back")) is Reply.Ok)
    assertEquals("bad-params", code(run(screen, "phone.launch", JSONObject().put("package", "sh -c x"))))
    assertTrue(run(screen, "phone.launch", JSONObject().put("package", "com.android.settings")) is Reply.Ok)
  }

  @Test
  fun onlyTheHomeKeyCountsAsLeavingAnApp() {
    val screen = FakeScreen()
    run(screen, "phone.key", JSONObject().put("key", "home"))
    assertEquals(true, screen.leaving)
    run(screen, "phone.key", JSONObject().put("key", "back"))
    assertEquals(false, screen.leaving)
  }

  @Test
  fun treeAndAppsAreReadsAndNeedOnlyTheService() {
    assertTrue(run(FakeScreen(), "phone.tree") is Reply.Ok)
    assertEquals("no-service", code(run(FakeScreen(LinkProtocol.screenError("no-service")), "phone.apps")))
  }

  @Test
  fun streamTakesZeroToFiveFramesASecond() {
    val screen = FakeScreen()
    assertTrue(run(screen, "phone.stream", JSONObject().put("fps", 5).put("maxSide", 800)) is Reply.Ok)
    assertEquals(5 to 800, screen.streamed)
    assertEquals("bad-params", code(run(screen, "phone.stream", JSONObject().put("fps", 6))))
    assertEquals("bad-params", code(run(screen, "phone.stream")))
  }

  @Test
  fun stopEndsTheSessionFromTheDesktop() {
    val screen = FakeScreen()
    run(screen, "phone.stop")
    assertTrue(screen.stopped)
  }

  @Test
  fun unknownMethodsAreNotFound() {
    assertEquals(METHOD_NOT_FOUND, (run(FakeScreen(), "phone.unknown") as Reply.Fail).error.code)
  }

  @Test
  fun sessionConfigTakesOnlyKnownLimitsLevelsPinnedTargetsAndPackageNames() {
    val good = JSONObject()
      .put("host", "100.64.0.2").put("port", 8722.0).put("fingerprint", "sha256/abc").put("deviceToken", "t")
      .put("sessionId", "w1").put("limitSec", 900).put("level", "control")
      .put("blocked", JSONArray(listOf("com.bank.app", "not a package")))
    val parsed = SessionConfig.parse(good)!!
    assertEquals(900, parsed.limitSec)
    assertEquals(setOf("com.bank.app"), parsed.blocked)
    assertEquals("The agent", parsed.agentName)
    assertNull(SessionConfig.parse(JSONObject(good.toString()).put("limitSec", 901)))
    assertNull(SessionConfig.parse(JSONObject(good.toString()).put("level", "root")))
    assertNull(SessionConfig.parse(JSONObject(good.toString()).put("fingerprint", "md5/abc")))
    assertNull(SessionConfig.parse(JSONObject(good.toString()).put("sessionId", "")))
    assertNull(parsed.requestId)
    assertEquals("req-7", SessionConfig.parse(JSONObject(good.toString()).put("requestId", "req-7"))!!.requestId)
    assertNull(SessionConfig.parse(JSONObject(good.toString()).put("requestId", "bad id\n"))!!.requestId)
  }
}
