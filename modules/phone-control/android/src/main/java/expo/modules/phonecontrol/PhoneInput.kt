package expo.modules.phonecontrol

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo

class NodeAdapter(private val node: AccessibilityNodeInfo) : NodeView {
  override val className get() = node.className?.toString() ?: ""
  override val text get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && node.isShowingHintText) null else node.text?.toString()
  override val description get() = node.contentDescription?.toString()
  override val resourceId get() = node.viewIdResourceName
  override val bounds: IntArray get() = Rect().also { node.getBoundsInScreen(it) }.let { intArrayOf(it.left, it.top, it.right, it.bottom) }
  override val clickable get() = node.isClickable
  override val editable get() = node.isEditable
  override val checkable get() = node.isCheckable
  override val checked get() = node.isChecked
  override val scrollable get() = node.isScrollable
  override val focused get() = node.isFocused
  override val password get() = node.isPassword
  override val visible get() = node.isVisibleToUser
  override fun children(): List<NodeView> = (0 until node.childCount).mapNotNull { node.getChild(it)?.let(::NodeAdapter) }
}

class NodeField(private val node: AccessibilityNodeInfo) : FieldView {
  override val packageName get() = node.packageName?.toString() ?: ""
  override val text get() = NodeAdapter(node).text ?: ""
  override val selectionStart get() = node.textSelectionStart
  override val selectionEnd get() = node.textSelectionEnd
  override val password get() = node.isPassword
  override val multiLine get() = node.isMultiLine
  override val label: String
    get() {
      val hint = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) node.hintText?.toString() else null
      return listOfNotNull(hint, node.contentDescription?.toString()).firstOrNull { it.isNotBlank() }?.take(80) ?: ""
    }

  override fun setText(text: String, cursor: Int): Boolean {
    val set = node.performAction(
      AccessibilityNodeInfo.ACTION_SET_TEXT,
      Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text) },
    )
    if (!set) return false
    node.performAction(
      AccessibilityNodeInfo.ACTION_SET_SELECTION,
      Bundle().apply {
        putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, cursor)
        putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, cursor)
      },
    )
    return node.refresh() && this.text == text
  }

  override fun enter(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)

  override fun next(): Boolean = node.focusSearch(View.FOCUS_FORWARD)?.performAction(AccessibilityNodeInfo.ACTION_FOCUS) ?: false
}

class PhoneInput(private val service: AccessibilityService, private val handler: Handler) : Device {
  override fun windows(): List<WindowView> =
    service.windows.sortedByDescending { it.layer }.map { window ->
      val root = window.root
      val bounds = Rect().also { window.getBoundsInScreen(it) }
      WindowView(kindOf(window.type), root?.packageName?.toString(), intArrayOf(bounds.left, bounds.top, bounds.right, bounds.bottom), window.isActive, root?.let(::NodeAdapter))
    }

  private fun kindOf(type: Int) = when (type) {
    AccessibilityWindowInfo.TYPE_APPLICATION -> WindowKind.APP
    AccessibilityWindowInfo.TYPE_SYSTEM -> WindowKind.SYSTEM
    AccessibilityWindowInfo.TYPE_INPUT_METHOD -> WindowKind.KEYBOARD
    AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY -> WindowKind.OVERLAY
    else -> WindowKind.OTHER
  }

  override fun label(packageName: String): String = try {
    val pm = service.packageManager
    pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
  } catch (_: PackageManager.NameNotFoundException) {
    packageName
  }

  override fun tap(x: Int, y: Int, count: Int, holdMs: Int, done: (Boolean) -> Unit): List<Long> {
    val press = maxOf(holdMs, TAP_MS).toLong()
    val starts = (0 until count).map { it * (press + DOUBLE_GAP_MS) }
    val builder = GestureDescription.Builder()
    starts.forEach { start -> builder.addStroke(GestureDescription.StrokeDescription(Path().apply { moveTo(x.toFloat(), y.toFloat()) }, start, press)) }
    dispatch(builder.build(), done)
    return starts
  }

  override fun swipe(from: IntArray, to: IntArray, durationMs: Int, done: (Boolean) -> Unit): List<Long> {
    val path = Path().apply {
      moveTo(from[0].toFloat(), from[1].toFloat())
      lineTo(to[0].toFloat(), to[1].toFloat())
    }
    dispatch(GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, durationMs.toLong())).build(), done)
    return listOf(0L)
  }

  private fun dispatch(gesture: GestureDescription, done: (Boolean) -> Unit) {
    val sent = service.dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
      override fun onCompleted(gestureDescription: GestureDescription?) = done(true)

      override fun onCancelled(gestureDescription: GestureDescription?) = done(false)
    }, handler)
    if (!sent) done(false)
  }

  override fun field(): FieldView? = service.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.takeIf { it.refresh() && it.isEditable }?.let(::NodeField)

  override fun global(key: String): Boolean = when (key) {
    "back" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
    "home" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
    "recents" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS)
    else -> false
  }

  override fun launch(packageName: String): Boolean {
    val intent = service.packageManager.getLaunchIntentForPackage(packageName) ?: return false
    service.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    return true
  }

  override fun launcherApps(): List<Pair<String, String>> {
    val pm = service.packageManager
    return pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
      .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
      .distinctBy { it.first }
      .sortedBy { it.second.lowercase() }
  }

  companion object {
    const val TAP_MS = 60
    const val DOUBLE_GAP_MS = 90L
  }
}
