package expo.modules.phonecontrol

import java.util.concurrent.CopyOnWriteArraySet

data class SessionStatus(
  val state: String,
  val reason: String? = null,
  val endsAt: Long = 0,
  val screenId: String? = null,
  val sessionId: String? = null,
) {
  fun toMap(): Map<String, Any?> = mapOf("state" to state, "reason" to reason, "endsAt" to endsAt, "screenId" to screenId, "sessionId" to sessionId)
}

object SessionStatusHub {
  @Volatile
  var current = SessionStatus("idle")
    private set

  private val listeners = CopyOnWriteArraySet<(SessionStatus) -> Unit>()

  fun publish(status: SessionStatus) {
    current = status
    listeners.forEach { it(status) }
  }

  @Volatile
  var pendingAsk: Map<String, String>? = null

  fun takePendingAsk(): Map<String, String>? {
    val ask = pendingAsk
    pendingAsk = null
    return ask
  }

  fun listen(listener: (SessionStatus) -> Unit): () -> Unit {
    listeners.add(listener)
    return { listeners.remove(listener) }
  }
}
