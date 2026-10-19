package expo.modules.phonecontrol

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class PhoneControlModule : Module() {
  private var consentPromise: Promise? = null
  private var consent: Intent? = null
  private var unlisten: (() -> Unit)? = null

  override fun definition() = ModuleDefinition {
    Name("PhoneControl")

    Events("onStatus")

    OnStartObserving("onStatus") {
      unlisten = SessionStatusHub.listen { sendEvent("onStatus", it.toMap()) }
    }

    OnStopObserving("onStatus") {
      unlisten?.invoke()
      unlisten = null
    }

    Function("isAvailable") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q }

    Function("status") { SessionStatusHub.current.toMap() }

    AsyncFunction("askConsent") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null || consentPromise != null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val manager = activity.getSystemService(MediaProjectionManager::class.java)
      val intent =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
        } else {
          manager.createScreenCaptureIntent()
        }
      consent = null
      consentPromise = promise
      activity.startActivityForResult(intent, CONSENT_REQUEST)
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != CONSENT_REQUEST) return@OnActivityResult
      val granted = payload.resultCode == Activity.RESULT_OK && payload.data != null
      consent = if (granted) payload.data else null
      consentPromise?.resolve(granted)
      consentPromise = null
    }

    Function("start") { options: Map<String, Any?> ->
      val context = appContext.reactContext ?: return@Function false
      val granted = consent ?: return@Function false
      val session = SessionConfig.parse(JSONObject(options)) ?: return@Function false
      consent = null
      val intent = session.into(Intent(context, PhoneControlService::class.java))
        .setAction(PhoneControlService.ACTION_START)
        .putExtra(PhoneControlService.EXTRA_CONSENT, granted)
      ContextCompat.startForegroundService(context, intent)
      true
    }

    Function("accessibilityEnabled") {
      appContext.reactContext?.let { OstiaAccessibilityService.isEnabled(it) } ?: false
    }

    Function("openAccessibilitySettings") {
      val activity = appContext.currentActivity ?: return@Function Unit
      activity.startActivity(Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS))
      Unit
    }

    Function("resume") {
      val context = appContext.reactContext ?: return@Function Unit
      if (SessionStatusHub.current.state == "paused") {
        context.startService(Intent(context, PhoneControlService::class.java).setAction(PhoneControlService.ACTION_RESUME))
      }
      Unit
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function Unit
      if (SessionStatusHub.current.state in setOf("starting", "running", "paused")) {
        context.startService(Intent(context, PhoneControlService::class.java).setAction(PhoneControlService.ACTION_STOP))
      }
      Unit
    }
  }

  companion object {
    private const val CONSENT_REQUEST = 4713
  }
}
