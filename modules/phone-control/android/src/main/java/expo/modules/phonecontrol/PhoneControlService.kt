package expo.modules.phonecontrol

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

class HandlerScheduler(private val handler: Handler) : Scheduler {
  override fun post(task: () -> Unit) {
    handler.post(task)
  }

  override fun postDelayed(delayMs: Long, task: () -> Unit): Cancellable {
    val runnable = Runnable(task)
    handler.postDelayed(runnable, delayMs)
    return Cancellable { handler.removeCallbacks(runnable) }
  }

  override fun clear() {
    handler.removeCallbacksAndMessages(null)
  }
}

class PhoneControlService : Service(), SessionHost, AccessibilityClient {
  private lateinit var thread: HandlerThread
  private lateinit var handler: Handler
  private var projection: MediaProjection? = null
  private var session: PhoneSession? = null
  private var shown: Notification? = null
  private var receiving = false
  private val screenOff = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      handler.post { session?.screenOff() }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    thread = HandlerThread("phone-control").apply { start() }
    handler = Handler(thread.looper)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> handler.post { session?.stop("stop-phone") ?: stopSelf() }
      ACTION_RESUME -> handler.post { session?.resume() }
      ACTION_START -> begin(intent)
    }
    return START_NOT_STICKY
  }

  private fun foreground(notice: Notification) {
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      notice,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION else 0,
    )
  }

  private fun begin(intent: Intent) {
    val notice = shown
    if (notice != null && session?.ended == false) return foreground(notice)
    val config = SessionConfig.from(intent)
    val consent = consentOf(intent)
    val endsAt = System.currentTimeMillis() + (config?.limitSec ?: 0) * 1000L
    foreground(notification(config?.desktopName ?: "Your desktop", endsAt).also { shown = it })
    if (config == null || consent == null) {
      finished()
      return
    }
    val blocklist = Blocklist(packageName, autofillPackages(), config.blocked)
    val started = PhoneSession(config, endsAt, System::currentTimeMillis, HandlerScheduler(handler), this, blocklist, packageName)
    session = started
    ContextCompat.registerReceiver(this, screenOff, IntentFilter(Intent.ACTION_SCREEN_OFF), ContextCompat.RECEIVER_NOT_EXPORTED)
    receiving = true
    handler.post {
      val granted = getSystemService(MediaProjectionManager::class.java).getMediaProjection(Activity.RESULT_OK, consent)
      if (granted == null) {
        started.stop("projection-ended")
        return@post
      }
      projection = granted
      granted.registerCallback(object : MediaProjection.Callback() {
        override fun onStop() {
          handler.post { started.stop("projection-ended") }
        }
      }, handler)
      OstiaAccessibilityService.client = this
      attach(started)
      started.start(ScreenCapture(this, granted, handler).also { it.start() }) { listener -> ScreenLink(config.target, started::startParams, listener) }
    }
  }

  private fun attach(started: PhoneSession) {
    val service = OstiaAccessibilityService.instance ?: return
    if (started.attached) return
    started.attach(PhoneInput(service, handler), ServiceOverlays(service))
  }

  private fun autofillPackages(): Set<String> =
    packageManager.queryIntentServices(Intent("android.service.autofill.AutofillService"), 0)
      .map { it.serviceInfo.packageName }
      .toSet()

  override fun onWindowsChanged() {
    handler.post {
      val started = session ?: return@post
      attach(started)
      started.windowsChanged()
    }
  }

  override fun onServiceOff() {
    handler.post { session?.serviceOff() }
  }

  override fun publish(status: SessionStatus) = SessionStatusHub.publish(status)

  override fun openAsk(ask: AskLine) {
    val started = session ?: return
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT) ?: return
    SessionStatusHub.pendingAsk = mapOf("sessionId" to started.sessionId, "askId" to ask.askId, "label" to started.label)
    (OstiaAccessibilityService.instance ?: this).startActivity(launch)
  }

  override fun finished() {
    if (OstiaAccessibilityService.client === this) OstiaAccessibilityService.client = null
    if (receiving) unregisterReceiver(screenOff)
    receiving = false
    projection?.stop()
    projection = null
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    handler.post { session?.displayChanged() }
  }

  override fun onDestroy() {
    handler.post { session?.stop("stop-phone") }
    thread.quitSafely()
    super.onDestroy()
  }

  private fun notification(desktopName: String, endsAt: Long): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Phone sessions", NotificationManager.IMPORTANCE_LOW))
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val open = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val until = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(endsAt))
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("$desktopName can see this screen")
      .setContentText("Ends at $until. Tap to stop or resume.")
      .setSmallIcon(smallIcon(this))
      .setOngoing(true)
      .setSilent(true)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setGroup(CHANNEL_ID)
      .setContentIntent(open)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
    return builder.addAction(0, "Stop", serviceIntent(ACTION_STOP, 1)).build()
  }

  private fun serviceIntent(action: String, code: Int): PendingIntent =
    PendingIntent.getService(this, code, Intent(this, PhoneControlService::class.java).setAction(action), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

  companion object {
    const val ACTION_START = "expo.modules.phonecontrol.START"
    const val ACTION_STOP = "expo.modules.phonecontrol.STOP"
    const val ACTION_RESUME = "expo.modules.phonecontrol.RESUME"
    const val EXTRA_CONSENT = "consent"
    private const val CHANNEL_ID = "phone-control"
    private const val NOTIFICATION_ID = 4712

    private fun smallIcon(context: Context): Int {
      val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      return if (id != 0) id else context.applicationInfo.icon
    }

    private fun consentOf(intent: Intent): Intent? =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) intent.getParcelableExtra(EXTRA_CONSENT, Intent::class.java)
      else @Suppress("DEPRECATION") intent.getParcelableExtra(EXTRA_CONSENT)
  }
}

data class SessionConfig(
  val target: LinkTarget,
  val sessionId: String,
  val label: String,
  val desktopName: String,
  val agentName: String,
  val limitSec: Int,
  val level: String,
  val blocked: Set<String>,
  val requestId: String? = null,
) {
  fun into(intent: Intent): Intent =
    intent
      .putExtra("host", target.host)
      .putExtra("port", target.port)
      .putExtra("fingerprint", target.fingerprint)
      .putExtra("deviceToken", target.deviceToken)
      .putExtra("sessionId", sessionId)
      .putExtra("label", label)
      .putExtra("desktopName", desktopName)
      .putExtra("agentName", agentName)
      .putExtra("limitSec", limitSec)
      .putExtra("level", level)
      .putStringArrayListExtra("blocked", ArrayList(blocked))
      .putExtra("requestId", requestId)

  companion object {
    val LIMITS = setOf(300, 900, 1800)
    val LEVELS = setOf("view", "control")
    private const val MAX_BLOCKED = 500
    private val REQUEST_ID = Regex("[A-Za-z0-9._:-]{1,100}")

    fun from(intent: Intent): SessionConfig? {
      val json = JSONObject()
      listOf("host", "fingerprint", "deviceToken", "sessionId", "label", "desktopName", "agentName", "level", "requestId").forEach { key ->
        intent.getStringExtra(key)?.let { json.put(key, it) }
      }
      json.put("port", intent.getIntExtra("port", 0)).put("limitSec", intent.getIntExtra("limitSec", 0))
      json.put("blocked", JSONArray(intent.getStringArrayListExtra("blocked") ?: arrayListOf<String>()))
      return parse(json)
    }

    fun parse(json: JSONObject): SessionConfig? {
      val host = json.optString("host", "")
      val port = json.optInt("port", 0)
      val fingerprint = json.optString("fingerprint", "")
      val token = json.optString("deviceToken", "")
      val sessionId = json.optString("sessionId", "")
      val limit = json.optInt("limitSec", 0)
      val level = json.optString("level", "")
      if (host.isEmpty() || port !in 1..65535 || !fingerprint.startsWith("sha256/") || token.isEmpty() || sessionId.isEmpty()) return null
      if (limit !in LIMITS || level !in LEVELS) return null
      val list = json.optJSONArray("blocked") ?: JSONArray()
      if (list.length() > MAX_BLOCKED) return null
      val blocked = (0 until list.length()).mapNotNull { list.opt(it) as? String }.filter { RequestHandler.PACKAGE.matches(it) }.toSet()
      return SessionConfig(
        LinkTarget(host, port, fingerprint, token),
        sessionId,
        json.optString("label", "").take(80),
        json.optString("desktopName", "").ifEmpty { "Your desktop" }.take(80),
        json.optString("agentName", "").ifEmpty { "The agent" }.take(40),
        limit,
        level,
        blocked,
        json.optString("requestId", "").takeIf { REQUEST_ID.matches(it) },
      )
    }
  }
}
