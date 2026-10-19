package expo.modules.phonecontrol

data class TapTarget(val packageName: String, val label: String, val checkable: Boolean, val bounds: List<Int> = emptyList())

object ConfirmPolicy {
  private val SYSTEM_DIALOGS = setOf(
    "com.android.packageinstaller",
    "com.google.android.packageinstaller",
    "com.android.permissioncontroller",
    "com.google.android.permissioncontroller",
  )

  private val WORDS = listOf(
    "uninstall", "delete", "remove", "send", "buy", "pay", "purchase", "subscribe",
    "install", "clear", "reset", "erase", "allow", "confirm", "disable", "archive", "force",
  )

  private val WORD = Regex("[\\p{L}]+")

  fun needsConfirm(target: TapTarget): Boolean {
    if (target.checkable) return true
    if (target.packageName in SYSTEM_DIALOGS) return true
    val words = WORD.findAll(target.label.lowercase()).map { it.value }.toSet()
    return WORDS.any { it in words }
  }

  fun allowKey(target: TapTarget): String? = sessionKey(target.packageName, "tap", target.label)

  fun enterKey(packageName: String, label: String): String? = sessionKey(packageName, "enter", label)

  private fun sessionKey(packageName: String, action: String, label: String): String? {
    val name = label.lowercase().trim().replace(Regex("\\s+"), " ")
    if (packageName in SYSTEM_DIALOGS || name.isEmpty()) return null
    return "$packageName\n$action\n$name"
  }
}
