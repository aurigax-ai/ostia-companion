package expo.modules.agentwatch

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AgentWatchModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AgentWatch")

    Function("start") { text: String ->
      appContext.reactContext?.let { context ->
        val intent = Intent(context, AgentWatchService::class.java).putExtra(AgentWatchService.EXTRA_TEXT, text)
        ContextCompat.startForegroundService(context, intent)
      }
      Unit
    }

    Function("stop") {
      appContext.reactContext?.let { context -> context.stopService(Intent(context, AgentWatchService::class.java)) }
      Unit
    }
  }
}
