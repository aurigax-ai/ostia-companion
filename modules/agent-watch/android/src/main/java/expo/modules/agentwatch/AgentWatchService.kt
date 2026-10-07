package expo.modules.agentwatch

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class AgentWatchService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Watching agents"
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      notification(this, text),
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0,
    )
    return START_STICKY
  }

  companion object {
    const val EXTRA_TEXT = "text"
    private const val CHANNEL_ID = "agent-watch"
    private const val NOTIFICATION_ID = 4711

    private fun smallIcon(context: Context): Int {
      val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      return if (id != 0) id else context.applicationInfo.icon
    }

    private fun notification(context: Context, text: String): Notification {
      val manager = context.getSystemService(NotificationManager::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
        manager.createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "Watching agents", NotificationManager.IMPORTANCE_MIN),
        )
      }
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      val open = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      return NotificationCompat.Builder(context, CHANNEL_ID)
        .setContentTitle(text)
        .setSmallIcon(smallIcon(context))
        .setOngoing(true)
        .setSilent(true)
        .setContentIntent(open)
        .build()
    }
  }
}
