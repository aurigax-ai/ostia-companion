package expo.modules.phonecontrol

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

object OverlayTheme {
  val surface = Color.parseColor("#202020")
  val surfaceHigh = Color.parseColor("#2b2b2b")
  val fg = Color.parseColor("#f2f4f8")
  val muted = Color.parseColor("#a2a2a2")
  val brand = Color.parseColor("#f2b347")
  val onBrand = Color.parseColor("#161616")
}

private fun Context.dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

private fun overlayParams(width: Int, height: Int, gravity: Int, flags: Int) =
  WindowManager.LayoutParams(width, height, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY, flags, PixelFormat.TRANSLUCENT)
    .apply { this.gravity = gravity }

class TouchWatch(private val context: Context, private val ownWindows: () -> List<Rect>, private val onHumanTouch: () -> Unit) {
  private val windows = context.getSystemService(WindowManager::class.java)
  private var view: View? = null

  fun show() {
    if (view != null) return
    val probe = View(context)
    probe.setOnTouchListener { _, event ->
      if (event.actionMasked == MotionEvent.ACTION_OUTSIDE) {
        val x = event.rawX.toInt()
        val y = event.rawY.toInt()
        if (ownWindows().none { it.contains(x, y) }) onHumanTouch()
      }
      false
    }
    val flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
      WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH
    windows.addView(probe, overlayParams(1, 1, Gravity.TOP or Gravity.START, flags))
    view = probe
  }

  fun hide() {
    view?.let { windows.removeView(it) }
    view = null
  }
}

class ConfirmPanel(private val context: Context) {
  private val windows = context.getSystemService(WindowManager::class.java)
  private var view: View? = null

  val bounds: Rect?
    get() = view?.let { v ->
      val at = IntArray(2)
      v.getLocationOnScreen(at)
      Rect(at[0], at[1], at[0] + v.width, at[1] + v.height)
    }

  fun show(request: ConfirmRequest, answer: (ConfirmAnswer) -> Unit) {
    hide()
    val pad = context.dp(16)
    val panel = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(pad, pad, pad, pad)
      background = GradientDrawable().apply {
        setColor(OverlayTheme.surface)
        cornerRadius = context.dp(16).toFloat()
      }
    }
    panel.addView(TextView(context).apply {
      text = "Allow this?"
      setTextColor(OverlayTheme.fg)
      textSize = 16f
      typeface = Typeface.DEFAULT_BOLD
    })
    panel.addView(TextView(context).apply {
      text = "${request.agent} wants to ${request.what} in ${request.appLabel}."
      setTextColor(OverlayTheme.muted)
      textSize = 14f
      setPadding(0, context.dp(4), 0, context.dp(12))
    })
    val row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
    fun button(label: String, filled: Boolean, choice: ConfirmAnswer) = Button(context).apply {
      text = label
      isAllCaps = false
      textSize = 14f
      setTextColor(if (filled) OverlayTheme.onBrand else OverlayTheme.fg)
      background = GradientDrawable().apply {
        setColor(if (filled) OverlayTheme.brand else OverlayTheme.surfaceHigh)
        cornerRadius = context.dp(999).toFloat()
      }
      setOnClickListener {
        hide()
        answer(choice)
      }
    }
    val weight = LinearLayout.LayoutParams(0, context.dp(44), 1f).apply { marginEnd = context.dp(8) }
    row.addView(button("Deny", false, ConfirmAnswer.DENY), weight)
    if (request.allowForSession) row.addView(button("This session", false, ConfirmAnswer.ALLOW_SESSION), LinearLayout.LayoutParams(weight))
    row.addView(button("Allow once", true, ConfirmAnswer.ALLOW_ONCE), LinearLayout.LayoutParams(0, context.dp(44), 1f))
    panel.addView(row)
    val params = overlayParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      Gravity.BOTTOM,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
    ).apply {
      x = 0
      y = context.dp(24)
      horizontalMargin = 0f
    }
    val frame = LinearLayout(context).apply {
      setPadding(context.dp(12), 0, context.dp(12), 0)
      addView(panel, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }
    windows.addView(frame, params)
    view = frame
  }

  fun onPlaced(placed: (IntArray) -> Unit) {
    view?.addOnLayoutChangeListener { v, _, _, _, _, _, _, _, _ ->
      val at = IntArray(2)
      v.getLocationOnScreen(at)
      placed(intArrayOf(at[0], at[1], at[0] + v.width, at[1] + v.height))
    }
  }

  fun hide() {
    view?.let { windows.removeView(it) }
    view = null
  }
}

class ServiceOverlays(private val context: Context) : Overlays {
  private val main = Handler(Looper.getMainLooper())
  private val panel = ConfirmPanel(context)
  private var watch: TouchWatch? = null
  @Volatile
  private var closed = false
  @Volatile
  private var panelRect: IntArray? = null

  private fun onMain(block: () -> Unit) {
    main.post { if (!closed) block() }
  }

  override fun watchTouches(onTouch: () -> Unit) = onMain {
    if (watch == null) watch = TouchWatch(context, { listOfNotNull(panel.bounds) }, onTouch).also { it.show() }
  }

  override fun confirm(request: ConfirmRequest, answer: (ConfirmAnswer) -> Unit) = onMain {
    panel.show(request) { choice ->
      panelRect = null
      answer(choice)
    }
    panel.onPlaced { panelRect = it }
  }

  override fun hideConfirm() = onMain {
    panel.hide()
    panelRect = null
  }

  override fun ownRects(): List<IntArray> = listOfNotNull(panelRect)

  override fun close() {
    closed = true
    panelRect = null
    main.post {
      watch?.hide()
      watch = null
      panel.hide()
    }
  }
}
