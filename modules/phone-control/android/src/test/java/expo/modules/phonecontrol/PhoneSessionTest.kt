package expo.modules.phonecontrol

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneSessionTest {
  private val clock = FakeClock()
  private val scheduler = FakeScheduler(clock)
  private val host = FakeHost()
  private val frames = FakeFrames()
  private val link = FakeLink()
  private val session = PhoneSession(TEST_CONFIG, clock.now + 300_000, clock, scheduler, host, TEST_BLOCKLIST, OWN)

  private fun linked() {
    session.attach(FakeDevice(), FakeOverlays())
    session.start(frames) { link }
    session.onLinked("scr-1")
    scheduler.runDue()
  }

  private fun ask(id: Any, method: String, params: JSONObject = JSONObject()) {
    session.onRequest(request(id, method, params))
    scheduler.runDue()
  }

  @Test
  fun PHC_C4_aCaptureAnswersAJpegWithTheDisplaySize() {
    linked()
    ask(1, "phone.capture")
    assertEquals(2400, link.replies[1]!!.getInt("screenHeight"))
    assertEquals("running", host.statuses.last().state)
  }

  @Test
  fun PHC_C5_theTimeLimitEndsTheSessionAndTellsTheDesktop() {
    linked()
    scheduler.advance(300_000)
    assertEquals("time-limit", link.events("screen.state").last().getString("reason"))
    assertTrue(link.closed)
    assertTrue(frames.stopped)
    assertTrue(host.finished)
    assertEquals("stopped" to "time-limit", host.statuses.last().let { it.state to it.reason })
  }

  @Test
  fun aRequestAfterTheLimitEndsTheSessionEvenWhenTheTimerStalled() {
    linked()
    clock.now += 300_000
    ask(1, "phone.capture")
    assertFalse(link.replies.containsKey(1))
    assertTrue(link.closed)
    assertEquals("time-limit", host.statuses.last().reason)
  }

  @Test
  fun aStreamTickAfterTheLimitSendsNoFrame() {
    linked()
    ask(1, "phone.stream", JSONObject().put("fps", 1))
    scheduler.runDue()
    assertEquals(1, link.frames.size)
    clock.now += 300_000
    scheduler.advance(1000)
    assertEquals(1, link.frames.size)
    assertTrue(link.closed)
  }

  @Test
  fun PHC_C6_aRevokedLinkEndsTheSessionWithoutAnEvent() {
    linked()
    session.onClosed(CLOSE_REVOKED)
    scheduler.runDue()
    assertEquals("revoked", host.statuses.last().reason)
    assertTrue(link.events("screen.state").none { it.getString("state") == "stopped" })
    assertTrue(frames.stopped)
  }

  @Test
  fun PHC_C7_stopOnThePhoneClosesTheLinkAndStopsTheCapture() {
    linked()
    session.stop("stop-phone")
    assertEquals("stop-phone", link.events("screen.state").last().getString("reason"))
    assertTrue(link.closed)
    assertTrue(frames.stopped)
    assertTrue(host.finished)
  }

  @Test
  fun stopFromTheDesktopEndsTheSession() {
    linked()
    ask("d", "phone.stop")
    scheduler.runDue()
    assertEquals("stop-desktop", host.statuses.last().reason)
  }

  @Test
  fun framesThatDoNotFitTheSocketAreSkipped() {
    linked()
    ask(1, "phone.stream", JSONObject().put("fps", 5))
    scheduler.runDue()
    link.room = false
    scheduler.advance(1000)
    link.room = true
    scheduler.advance(200)
    val seqs = link.frames.map { bytes ->
      val length = java.nio.ByteBuffer.wrap(bytes, 1, 4).int
      JSONObject(String(bytes, 5, length, Charsets.UTF_8)).getLong("seq")
    }
    assertEquals(listOf(0L, 1L), seqs)
  }
}
