package expo.modules.phonecontrol

import org.json.JSONArray
import org.json.JSONObject

data class AskLine(val askId: String, val title: String, val agent: String?)

class AskTracker(private val sessionId: String) {
  private val open = linkedMapOf<String, AskLine>()

  fun load(asks: JSONArray?) {
    open.clear()
    if (asks == null) return
    for (i in 0 until asks.length()) asks.optJSONObject(i)?.let { add(it) }
  }

  fun add(ask: JSONObject) {
    if (ask.optString("sessionId") != sessionId) return
    val id = ask.optString("askId", "")
    if (id.isEmpty()) return
    open[id] = AskLine(id, ask.optString("title", "").take(160), ask.optString("agent", "").ifEmpty { null })
  }

  fun resolve(askId: String) {
    open.remove(askId)
  }

  fun first(): AskLine? = open.values.firstOrNull()

  fun count(): Int = open.size
}

enum class BarAction { STOP, RESUME, ANSWER }

data class BarContent(val title: String, val detail: String, val action: BarAction, val attention: Boolean)

object BarModel {
  fun content(
    agent: String,
    state: Pair<String, String?>,
    blockedLabel: String,
    lastAction: String?,
    timeLeft: String,
    ask: AskLine?,
  ): BarContent {
    val (name, reason) = state
    if (name == "paused" && reason == "human-touch") {
      return BarContent("Paused because you touched the screen", "$agent waits · $timeLeft", BarAction.RESUME, true)
    }
    if (name == "paused" && reason == "screen-off") {
      return BarContent("Paused while the screen was off", "$agent waits · $timeLeft", BarAction.RESUME, true)
    }
    if (ask != null) return BarContent("${ask.agent ?: agent} asks: ${ask.title}", "Tap Answer · $timeLeft", BarAction.ANSWER, true)
    if (name == "paused" && reason == "blocked-app") {
      return BarContent("$agent can't use $blockedLabel", "It sees a black screen here · $timeLeft", BarAction.STOP, false)
    }
    if (name == "paused" && reason == "confirm") return BarContent("$agent is waiting for your answer", timeLeft, BarAction.STOP, true)
    return BarContent("$agent · ${lastAction ?: "watching"}", timeLeft, BarAction.STOP, false)
  }

  fun timeLeft(endsAt: Long, now: Long): String {
    val seconds = maxOf(0L, (endsAt - now + 999) / 1000)
    return "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')} left"
  }

  fun tapped(label: String): String = if (label.isEmpty()) "tapped the screen" else "tapped “${label.take(40)}”"

  fun typed(length: Int): String = "typed $length character${if (length == 1) "" else "s"}"
}
