package expo.modules.phonecontrol

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionBarTest {
  private val clock = FakeClock()
  private val scheduler = FakeScheduler(clock)
  private val host = FakeHost()
  private val link = FakeLink()
  private val device = FakeDevice(listOf(appWindow("com.android.settings", button("Storage", 100, 300, 300, 400))))
  private val overlays = FakeOverlays()
  private val session = PhoneSession(TEST_CONFIG, clock.now + 300_000, clock, scheduler, host, TEST_BLOCKLIST, OWN).also {
    it.attach(device, overlays)
    it.start(FakeFrames()) { link }
    it.onLinked("scr-1")
    scheduler.runDue()
  }

  private fun ask(method: String, params: JSONObject): Int {
    session.onRequest(request(7, method, params))
    scheduler.runDue()
    return 7
  }

  @Test
  fun theBarShowsTimeLeftAndTheLastActionWithStop() {
    ask("phone.tap", JSONObject().put("x", 150).put("y", 350))
    assertEquals("claude · tapped “Storage”", overlays.shown!!.title)
    assertEquals(BarAction.STOP, overlays.shown!!.action)
    assertEquals(listOf(100, 300, 300, 400), overlays.flashes.single())
    scheduler.advance(61_000)
    assertEquals("3:59 left", overlays.shown!!.detail)
  }

  @Test
  fun PHC_C18_anOpenAskShowsOnTheBarAndAnswerOpensIt() {
    val (method, answer) = link.calls.single()
    assertEquals("ask.list", method)
    answer(Incoming.Response(10, JSONObject().put("asks", JSONArray().put(JSONObject().put("askId", "a1").put("sessionId", "s1").put("title", "Uninstall Drive?"))), null))
    scheduler.runDue()
    assertEquals(BarAction.ANSWER, overlays.shown!!.action)
    overlays.onBar!!(BarAction.ANSWER)
    scheduler.runDue()
    assertEquals("a1", host.opened!!.askId)
    session.onEvent(Incoming.Event("ask.resolved", JSONObject().put("askId", "a1")))
    scheduler.runDue()
    assertEquals(BarAction.STOP, overlays.shown!!.action)
  }

  @Test
  fun stopOnTheBarEndsTheSession() {
    overlays.onBar!!(BarAction.STOP)
    scheduler.runDue()
    assertEquals("stop-phone", host.statuses.last().reason)
    assertTrue(link.closed)
  }

  @Test
  fun theAgentCannotTapTheBar() {
    overlays.rects = listOf(intArrayOf(0, 60, 1080, 240))
    ask("phone.tap", JSONObject().put("x", 1000).put("y", 120))
    assertEquals("blocked-app", link.failures[7]!!.message)
    assertTrue(device.taps.isEmpty())
  }

  @Test
  fun theLinkStartsWithTheBarHeight() {
    assertEquals(180, session.startParams().overlayHeight)
  }
}
