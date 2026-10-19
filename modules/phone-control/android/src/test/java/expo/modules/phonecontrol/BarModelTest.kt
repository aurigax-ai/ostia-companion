package expo.modules.phonecontrol

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BarModelTest {
  private fun ask(id: String, session: String, title: String) =
    JSONObject().put("askId", id).put("sessionId", session).put("title", title).put("agent", "claude")

  @Test
  fun PHC_C18_tracksOnlyTheSessionsAsksInTheOrderTheyCame() {
    val tracker = AskTracker("s-api")
    tracker.load(JSONArray().put(ask("a1", "s-api", "Uninstall 4 apps?")).put(ask("a2", "s-web", "Deploy?")))
    tracker.add(ask("a3", "s-api", "Keep Duolingo?"))
    assertEquals(2, tracker.count())
    assertEquals("a1", tracker.first()?.askId)
    tracker.resolve("a1")
    assertEquals("Keep Duolingo?", tracker.first()?.title)
    tracker.resolve("a3")
    assertNull(tracker.first())
  }

  @Test
  fun theBarShowsWhatTheAgentDidWithTimeLeftAndStop() {
    val bar = BarModel.content("claude", "running" to null, "", BarModel.tapped("Last used"), "12:41 left", null)
    assertEquals("claude · tapped “Last used”", bar.title)
    assertEquals("12:41 left", bar.detail)
    assertEquals(BarAction.STOP, bar.action)
  }

  @Test
  fun PHC_C9_aTouchPauseOffersResume() {
    val bar = BarModel.content("claude", "paused" to "human-touch", "", null, "9:12 left", AskLine("a1", "Uninstall?", null))
    assertEquals("Paused because you touched the screen", bar.title)
    assertEquals("claude waits · 9:12 left", bar.detail)
    assertEquals(BarAction.RESUME, bar.action)
  }

  @Test
  fun anOpenAskOffersAnswer() {
    val bar = BarModel.content("claude", "running" to null, "", null, "5:00 left", AskLine("a1", "Uninstall 4 apps?", "codex"))
    assertEquals("codex asks: Uninstall 4 apps?", bar.title)
    assertEquals(BarAction.ANSWER, bar.action)
  }

  @Test
  fun aBlockedAppSaysTheAgentCannotUseIt() {
    assertEquals("claude can't use Bitwarden", BarModel.content("claude", "paused" to "blocked-app", "Bitwarden", null, "1:00 left", null).title)
  }

  @Test
  fun wordsTimeAndActionsWithoutWhatWasTyped() {
    assertEquals("12:41 left", BarModel.timeLeft(761_000, 0))
    assertEquals("0:00 left", BarModel.timeLeft(0, 5_000))
    assertEquals("typed 12 characters", BarModel.typed(12))
    assertEquals("typed 1 character", BarModel.typed(1))
  }
}
