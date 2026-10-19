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

class PhoneControlService : Service(), LinkListener, PhoneScreen {
  private lateinit var thread: HandlerThread
  private lateinit var handler: Handler
  private var projection: MediaProjection? = null
  private var capture: ScreenCapture? = null
  private var link: ScreenLink? = null
  private var config: SessionConfig? = null
  private var requests: RequestHandler? = null
  private var endsAt = 0L
  private var screenId: String? = null
  private var ended = false
  private var streamFps = 0
  private var streamSide = MAX_CAPTURE_SIDE
  private var streamSeq = 0L
  private val endAtLimit = Runnable { end("time-limit") }
  private val streamTick = object : Runnable {
    override fun run() {
      val source = capture ?: return
      if (streamFps <= 0) return
      if (source.changed) source.capture(streamSide, false)?.let { link?.sendFrame(LinkProtocol.frameBytes(streamSeq++, it)) }
      handler.postDelayed(this, 1000L / streamFps)
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
      ACTION_STOP -> handler.post { end("stop-phone") }
      ACTION_START -> begin(intent)
    }
    return START_NOT_STICKY
  }

  private fun begin(intent: Intent) {
    val session = SessionConfig.from(intent)
    val consent = consentOf(intent)
    if (config != null) return
    if (session == null || consent == null) {
      stopSelf()
      return
    }
    config = session
    endsAt = System.currentTimeMillis() + session.limitSec * 1000L
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      notification(session),
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION else 0,
    )
    SessionStatusHub.publish(SessionStatus("starting", endsAt = endsAt, sessionId = session.sessionId))
    handler.post {
      val manager = getSystemService(MediaProjectionManager::class.java)
      val granted = manager.getMediaProjection(Activity.RESULT_OK, consent)
      if (granted == null) {
        end("projection-ended")
        return@post
      }
      projection = granted
      granted.registerCallback(object : MediaProjection.Callback() {
        override fun onStop() {
          handler.post { end("projection-ended") }
        }
      }, handler)
      capture = ScreenCapture(this, granted, handler).also { it.start() }
      requests = RequestHandler(session.level, this)
      handler.postDelayed(endAtLimit, maxOf(0L, endsAt - System.currentTimeMillis()))
      link = ScreenLink(session.target, { startParams(session) }, this).also { it.open() }
    }
  }

  private fun startParams(session: SessionConfig): StartParams {
    val size = capture?.size ?: DisplaySize(0, 0, 1f, 0)
    return StartParams(session.sessionId, session.label, size.width, size.height, size.density, size.rotation, session.level, session.limitSec, endsAt, 0, null)
  }

  override fun onLinked(screenId: String) {
    handler.post {
      if (ended) return@post
      this.screenId = screenId
      SessionStatusHub.publish(SessionStatus("running", endsAt = endsAt, screenId = screenId, sessionId = config?.sessionId))
    }
  }

  override fun onRefused(reason: String) {
    handler.post { end(reason, notifyDesktop = false) }
  }

  override fun onRequest(request: Incoming.Request) {
    handler.post {
      val handlerNow = requests ?: return@post
      if (ended) return@post
      when (val reply = handlerNow.handle(request.method, request.params)) {
        is Reply.Ok -> link?.reply(request.id, reply.result)
        is Reply.Fail -> link?.fail(request.id, reply.error)
      }
    }
  }

  override fun onEvent(event: Incoming.Event) = Unit

  override fun onClosed(code: Int) {
    handler.post { end(if (code == CLOSE_REVOKED) "revoked" else "link-closed", notifyDesktop = false) }
  }

  override fun capture(maxSide: Int): Frame? = capture?.capture(maxSide, false)

  override fun foreground(): Foreground = Foreground("", "")

  override fun stream(fps: Int, maxSide: Int) {
    streamFps = fps
    streamSide = maxSide
    handler.removeCallbacks(streamTick)
    if (fps > 0) handler.post(streamTick)
  }

  override fun stopFromDesktop() {
    handler.post { end("stop-desktop") }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    handler.post {
      val source = capture ?: return@post
      if (source.follow() && screenId != null) link?.send(LinkProtocol.stateEvent("running", null, source.size, endsAt))
    }
  }

  private fun end(reason: String, notifyDesktop: Boolean = true) {
    if (ended) return
    ended = true
    handler.removeCallbacks(endAtLimit)
    handler.removeCallbacks(streamTick)
    val size = capture?.size
    if (notifyDesktop && screenId != null && size != null) link?.send(LinkProtocol.stateEvent("stopped", reason, size, endsAt))
    link?.close()
    link = null
    capture?.stop()
    capture = null
    projection?.stop()
    projection = null
    requests = null
    SessionStatusHub.publish(SessionStatus("stopped", reason, endsAt, screenId, config?.sessionId))
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    handler.post { end("stop-phone") }
    thread.quitSafely()
    super.onDestroy()
  }

  private fun notification(session: SessionConfig): Notification {
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
      .setContentTitle("${session.desktopName} can see this screen")
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
