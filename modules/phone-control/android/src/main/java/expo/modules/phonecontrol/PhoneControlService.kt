package expo.modules.phonecontrol

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
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

class PhoneControlService : Service(), SessionHost {
  private lateinit var thread: HandlerThread
  private lateinit var handler: Handler
  private var projection: MediaProjection? = null
  private var session: PhoneSession? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    thread = HandlerThread("phone-control").apply { start() }
    handler = Handler(thread.looper)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> handler.post { session?.stop("stop-phone") ?: stopSelf() }
      ACTION_START -> begin(intent)
    }
    return START_NOT_STICKY
  }

  private fun begin(intent: Intent) {
    if (session != null) return
    val config = SessionConfig.from(intent)
    val consent = consentOf(intent)
    val endsAt = System.currentTimeMillis() + (config?.limitSec ?: 0) * 1000L
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      notification(config?.desktopName ?: "Your desktop", endsAt),
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION else 0,
    )
    if (config == null || consent == null) {
      finished()
      return
    }
    val started = PhoneSession(config, endsAt, System::currentTimeMillis, HandlerScheduler(handler), this)
    session = started
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
      started.start(ScreenCapture(this, granted, handler).also { it.start() }) { listener -> ScreenLink(config.target, started::startParams, listener) }
    }
  }

  override fun publish(status: SessionStatus) = SessionStatusHub.publish(status)

  override fun finished() {
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
    val stop = PendingIntent.getService(
      this,
      1,
      Intent(this, PhoneControlService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val until = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(endsAt))
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("$desktopName can see this screen")
      .setContentText("Ends at $until. Tap to stop.")
      .setSmallIcon(smallIcon(this))
      .setOngoing(true)
      .setSilent(true)
      .setContentIntent(open)
      .addAction(0, "Stop", stop)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
  }

  companion object {
    const val ACTION_START = "expo.modules.phonecontrol.START"
    const val ACTION_STOP = "expo.modules.phonecontrol.STOP"
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
  val limitSec: Int,
  val level: String,
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
      .putExtra("limitSec", limitSec)
      .putExtra("level", level)

  companion object {
    val LIMITS = setOf(300, 900, 1800)
    val LEVELS = setOf("view", "control")

    fun from(intent: Intent): SessionConfig? {
      val host = intent.getStringExtra("host") ?: return null
      val fingerprint = intent.getStringExtra("fingerprint") ?: return null
      val token = intent.getStringExtra("deviceToken") ?: return null
      val sessionId = intent.getStringExtra("sessionId") ?: return null
      val limit = intent.getIntExtra("limitSec", 0)
      val level = intent.getStringExtra("level") ?: return null
      return parse(
        JSONObject()
          .put("host", host)
          .put("port", intent.getIntExtra("port", 0))
          .put("fingerprint", fingerprint)
          .put("deviceToken", token)
          .put("sessionId", sessionId)
          .put("label", intent.getStringExtra("label") ?: "")
          .put("desktopName", intent.getStringExtra("desktopName") ?: "")
          .put("limitSec", limit)
          .put("level", level),
      )
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
      return SessionConfig(
        LinkTarget(host, port, fingerprint, token),
        sessionId,
        json.optString("label", "").take(80),
        json.optString("desktopName", "").ifEmpty { "Your desktop" }.take(80),
        limit,
        level,
      )
    }
  }
}
