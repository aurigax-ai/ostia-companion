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

    Function("takePendingAsk") { SessionStatusHub.takePendingAsk() }

    Function("installedApps") {
      val context = appContext.reactContext ?: return@Function emptyList<Map<String, Any>>()
      val pm = context.packageManager
      val autofill = pm.queryIntentServices(Intent("android.service.autofill.AutofillService"), 0).map { it.serviceInfo.packageName }.toSet()
      val fixed = Blocklist(context.packageName, autofill, emptySet())
      pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
        .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
        .distinctBy { it.first }
        .filter { it.first != context.packageName }
        .sortedBy { it.second.lowercase() }
        .map { mapOf("package" to it.first, "label" to it.second, "alwaysBlocked" to fixed.blocks(it.first)) }
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
