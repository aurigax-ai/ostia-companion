package expo.modules.phonecontrol

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionInputTest {
  private val clock = FakeClock()
  private val scheduler = FakeScheduler(clock)
  private val host = FakeHost()
  private val frames = FakeFrames()
  private val link = FakeLink()
  private val device = FakeDevice(listOf(appWindow("com.android.settings", button("Uninstall", 100, 100, 300, 200), button("Storage", 100, 300, 300, 400))))
  private val overlays = FakeOverlays()
  private var nextId = 1

  private fun session(level: String = "control", attach: Boolean = true): PhoneSession {
    val made = PhoneSession(testConfig(level), clock.now + 300_000, clock, scheduler, host, TEST_BLOCKLIST, OWN)
    if (attach) made.attach(device, overlays)
    made.start(frames) { link }
    made.onLinked("scr-1")
    scheduler.runDue()
    return made
  }

  private fun PhoneSession.ask(method: String, params: JSONObject = JSONObject()): Int {
    val id = nextId++
    onRequest(request(id, method, params))
    scheduler.runDue()
    return id
  }

  private fun tap(x: Int, y: Int) = JSONObject().put("x", x).put("y", y)

  private fun failure(id: Int) = link.failures[id]?.message

  private fun answer(choice: ConfirmAnswer) {
    overlays.answer!!(choice)
    scheduler.runDue()
  }

  @Test
  fun capturesAreBlackWhileTheAccessibilityServiceIsOff() {
    val running = session(attach = false)
    val id = running.ask("phone.capture")
    assertTrue(link.replies[id]!!.getBoolean("blocked"))
    assertEquals(listOf(true), frames.blockedAsks)
  }

  @Test
  fun aViewOnlySessionStillHidesBlockedApps() {
    val running = session(level = "view")
    device.windows = listOf(appWindow("com.bank.app"))
    running.ask("phone.capture")
    assertEquals(listOf(true), frames.blockedAsks)
  }

  @Test
  fun aBlockedAppInSplitScreenBlacksTheCaptureAndRefusesTapsOnIt() {
    val running = session()
    device.windows = listOf(
      appWindow("com.android.settings", bounds = intArrayOf(0, 0, 1080, 1200)),
      appWindow("com.bank.app", bounds = intArrayOf(0, 1200, 1080, 2400), active = false),
    )
    running.ask("phone.capture")
    assertEquals(listOf(true), frames.blockedAsks)
    assertEquals("blocked-app", failure(running.ask("phone.tap", tap(500, 1800))))
    assertTrue(device.taps.isEmpty())
  }

  @Test
  fun aTapOnABlockedWindowUnderThePointIsRefused() {
    val running = session()
    device.windows = listOf(
      WindowView(WindowKind.SYSTEM, "com.android.systemui", intArrayOf(0, 0, 1080, 100), false, null),
      appWindow("com.android.settings"),
    )
    assertEquals("blocked-app", failure(running.ask("phone.tap", tap(500, 50))))
    assertNull(failure(running.ask("phone.tap", tap(500, 350))))
  }

  @Test
  fun aTapOnThePhonesOwnPanelIsRefused() {
    val running = session()
    overlays.rects = listOf(intArrayOf(0, 2000, 1080, 2300))
    assertEquals("blocked-app", failure(running.ask("phone.tap", tap(500, 2100))))
    assertEquals("blocked-app", failure(running.ask("phone.swipe", JSONObject().put("from", JSONArray("[500,1000]")).put("to", JSONArray("[500,2100]")))))
  }

  @Test
  fun PHC_C13_aHeldTapLandsOnlyAfterAllow() {
    val running = session()
    val id = running.ask("phone.tap", tap(150, 150))
    assertEquals("tap “Uninstall”", overlays.asked!!.what)
    assertTrue(device.taps.isEmpty())
    assertEquals("paused" to "confirm", link.events("screen.state").last().let { it.getString("state") to it.getString("reason") })
    answer(ConfirmAnswer.ALLOW_ONCE)
    assertEquals(1, device.taps.size)
    assertEquals("Uninstall", link.replies[id]!!.getJSONObject("target").getString("text"))
  }

  @Test
  fun aHeldTapDoesNotLandWhenTheHumanTouchedTheScreenMeanwhile() {
    val running = session()
    val id = running.ask("phone.tap", tap(150, 150))
    clock.now += 5_000
    overlays.onTouch!!()
    scheduler.runDue()
    answer(ConfirmAnswer.ALLOW_ONCE)
    assertEquals("paused", failure(id))
    assertTrue(device.taps.isEmpty())
  }

  @Test
  fun aHeldTapDoesNotLandWhenABlockedAppCameToTheFront() {
    val running = session()
    val id = running.ask("phone.tap", tap(150, 150))
    device.windows = listOf(appWindow("com.bank.app"))
    answer(ConfirmAnswer.ALLOW_ONCE)
    assertEquals("blocked-app", failure(id))
    assertTrue(device.taps.isEmpty())
  }

  @Test
  fun aHeldTapDoesNotLandWhenTheControlUnderItChanged() {
    val running = session()
    val id = running.ask("phone.tap", tap(150, 150))
    device.windows = listOf(appWindow("com.android.settings", button("Erase all data", 100, 100, 300, 200)))
    answer(ConfirmAnswer.ALLOW_ONCE)
    assertEquals("changed", failure(id))
    assertTrue(device.taps.isEmpty())
  }

  @Test
  fun PHC_C14_aHeldTapWithNoAnswerIsDeclinedAfterSixtySeconds() {
    val running = session()
    val id = running.ask("phone.tap", tap(150, 150))
    scheduler.advance(PhoneSession.CONFIRM_TIMEOUT_MS)
    assertEquals("declined", failure(id))
    assertNull(overlays.asked)
    assertTrue(device.taps.isEmpty())
    answer(ConfirmAnswer.ALLOW_ONCE)
    assertTrue(device.taps.isEmpty())
  }

  @Test
  fun anAnswerAfterStopDoesNothing() {
    val running = session()
    running.ask("phone.tap", tap(150, 150))
    running.stop("stop-phone")
    assertTrue(overlays.closed)
    answer(ConfirmAnswer.ALLOW_ONCE)
    assertTrue(device.taps.isEmpty())
  }

  @Test
  fun allowingOneControlForTheSessionAllowsOnlyThatControl() {
    val running = session()
    device.windows = listOf(appWindow("com.android.settings", button("Clear cache", 100, 100, 300, 200), button("Uninstall", 100, 300, 300, 400)))
    running.ask("phone.tap", tap(150, 150))
    assertTrue(overlays.asked!!.allowForSession)
    answer(ConfirmAnswer.ALLOW_SESSION)
    running.ask("phone.tap", tap(150, 150))
    assertNull(overlays.asked)
    assertEquals(2, device.taps.size)
    running.ask("phone.tap", tap(150, 350))
    assertEquals("tap “Uninstall”", overlays.asked!!.what)
  }

  @Test
  fun theInstallerAndPermissionDialogsAreNeverAllowedForTheSession() {
    val running = session()
    device.windows = listOf(appWindow("com.google.android.packageinstaller", button("OK", 100, 100, 300, 200)))
    running.ask("phone.tap", tap(150, 150))
    assertFalse(overlays.asked!!.allowForSession)
  }

  @Test
  fun PHC_C10_thePhonesOwnTapDoesNotPause() {
    val running = session()
    running.ask("phone.tap", tap(150, 350))
    clock.now += 40
    overlays.onTouch!!()
    scheduler.runDue()
    assertNull(failure(running.ask("phone.tap", tap(150, 350))))
  }

  @Test
  fun aHumanTouchDuringALongSwipePauses() {
    val running = session()
    device.finishAtOnce = false
    running.ask("phone.swipe", JSONObject().put("from", JSONArray("[500,1500]")).put("to", JSONArray("[500,500]")).put("durationMs", 3000))
    clock.now += 1500
    overlays.onTouch!!()
    scheduler.runDue()
    assertEquals("paused", failure(running.ask("phone.tap", tap(150, 350))))
  }

  @Test
  fun typingGoesInAtTheCursorAndReplacesTheSelection() {
    val running = session()
    val field = FakeField(text = "hello world", selectionStart = 5, selectionEnd = 5)
    device.field = field
    running.ask("phone.type", JSONObject().put("text", ","))
    assertEquals("hello, world", field.text)
    field.selectionStart = 7
    field.selectionEnd = 12
    running.ask("phone.type", JSONObject().put("text", "there"))
    assertEquals("hello, there", field.text)
    running.ask("phone.key", JSONObject().put("key", "delete"))
    assertEquals("hello, ther", field.text)
  }

  @Test
  fun theAgentNeverTypesIntoAPasswordField() {
    val running = session()
    device.field = FakeField(password = true)
    assertEquals("no-field", failure(running.ask("phone.type", JSONObject().put("text", "hunter2"))))
    assertEquals("", device.field!!.text)
  }

  @Test
  fun enterInASingleLineFieldAsksFirst() {
    val running = session()
    val field = FakeField()
    device.field = field
    val id = running.ask("phone.key", JSONObject().put("key", "enter"))
    assertEquals("press Enter in “Message”", overlays.asked!!.what)
    assertEquals(0, field.entered)
    answer(ConfirmAnswer.ALLOW_ONCE)
    assertEquals(1, field.entered)
    assertNotNull(link.replies[id])
    field.multiLine = true
    running.ask("phone.key", JSONObject().put("key", "enter"))
    assertEquals(2, field.entered)
  }

  @Test
  fun aViewOnlySessionAnswersViewOnlyForTheTreeAndApps() {
    val running = session(level = "view")
    assertEquals("view-only", failure(running.ask("phone.tree")))
    assertEquals("view-only", failure(running.ask("phone.apps")))
  }

  @Test
  fun appsLeaveOutBlockedOnes() {
    val running = session()
    val apps = link.replies[running.ask("phone.apps")]!!.getJSONArray("apps")
    assertEquals(listOf("com.android.settings"), (0 until apps.length()).map { apps.getJSONObject(it).getString("package") })
  }

  @Test
  fun PHC_C16_typedTextNeverLeavesInAnEventOrStatus() {
    val running = session()
    device.field = FakeField()
    running.ask("phone.type", JSONObject().put("text", "secret-words"))
    running.stop("stop-phone")
    assertFalse(link.sent.any { "secret-words" in it })
    assertFalse(link.replies.values.any { "secret-words" in it.toString() })
    assertFalse(host.statuses.any { "secret-words" in it.toString() })
  }
}
