package expo.modules.phonecontrol

class SessionGate(private val level: String) {
  var pausedFor: String? = null
    private set
  var foreground = Foreground("", "")
    private set
  var foregroundBlocked = false
    private set
  var confirming = false

  fun pause(reason: String): Boolean {
    if (pausedFor != null) return false
    pausedFor = reason
    return true
  }

  fun resume(): Boolean {
    if (pausedFor == null) return false
    pausedFor = null
    return true
  }

  fun moveTo(next: Foreground, blocked: Boolean): Boolean {
    if (next == foreground && blocked == foregroundBlocked) return false
    foreground = next
    foregroundBlocked = blocked
    return true
  }

  fun state(): Pair<String, String?> = when {
    pausedFor != null -> "paused" to pausedFor
    foregroundBlocked -> "paused" to "blocked-app"
    confirming -> "paused" to "confirm"
    else -> "running" to null
  }

  fun refuseInput(serviceOn: Boolean, leaving: Boolean = false): RpcError? = when {
    level == "view" -> LinkProtocol.screenError("view-only")
    !serviceOn -> LinkProtocol.screenError("no-service")
    pausedFor != null -> LinkProtocol.screenError("paused", pausedFor)
    foregroundBlocked && !leaving -> LinkProtocol.screenError("blocked-app")
    confirming -> LinkProtocol.screenError("paused", "confirm")
    else -> null
  }

  fun refuseRead(serviceOn: Boolean): RpcError? = when {
    level == "view" -> LinkProtocol.screenError("view-only")
    !serviceOn -> LinkProtocol.screenError("no-service")
    else -> null
  }
}
