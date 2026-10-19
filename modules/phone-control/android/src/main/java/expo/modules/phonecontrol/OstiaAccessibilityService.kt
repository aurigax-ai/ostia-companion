package expo.modules.phonecontrol

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent

interface AccessibilityClient {
  fun onWindowsChanged()
  fun onServiceOff()
}

class OstiaAccessibilityService : AccessibilityService() {
  override fun onServiceConnected() {
    instance = this
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    val type = event?.eventType ?: return
    if (type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || type == AccessibilityEvent.TYPE_WINDOWS_CHANGED) {
      client?.onWindowsChanged()
    }
  }

  override fun onInterrupt() = Unit

  override fun onUnbind(intent: android.content.Intent?): Boolean {
    gone()
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    gone()
    super.onDestroy()
  }

  private fun gone() {
    if (instance !== this) return
    instance = null
    client?.onServiceOff()
  }

  companion object {
    @Volatile
    var instance: OstiaAccessibilityService? = null
      private set

    @Volatile
    var client: AccessibilityClient? = null

    fun isEnabled(context: Context): Boolean {
      val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
      val name = "${context.packageName}/${OstiaAccessibilityService::class.java.name}"
      return enabled.split(':').any { it.equals(name, ignoreCase = true) }
    }
  }
}
