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
  val attn = Color.parseColor("#ee5396")
}

private fun Context.dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

private fun View.reportPlace(placed: (IntArray) -> Unit) {
  addOnLayoutChangeListener { v, _, _, _, _, _, _, _, _ ->
    val at = IntArray(2)
    v.getLocationOnScreen(at)
    placed(intArrayOf(at[0], at[1], at[0] + v.width, at[1] + v.height))
  }
}

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
    view?.reportPlace(placed)
  }

  fun hide() {
    view?.let { windows.removeView(it) }
    view = null
  }
}

class FloatingBar(private val context: Context, private val onAction: (BarAction) -> Unit) {
  private val windows = context.getSystemService(WindowManager::class.java)
  private var view: LinearLayout? = null
  private lateinit var dot: View
  private lateinit var title: TextView
  private lateinit var detail: TextView
  private lateinit var button: Button
  private var action = BarAction.STOP

  val bounds: Rect?
    get() = view?.let { v ->
      val at = IntArray(2)
      v.getLocationOnScreen(at)
      Rect(at[0], at[1], at[0] + v.width, at[1] + v.height)
    }

  val shown: Boolean get() = view != null

  fun onPlaced(placed: (IntArray) -> Unit) {
    view?.reportPlace(placed)
  }

  fun show(content: BarContent) {
    if (view == null) build()
    action = content.action
    title.text = content.title
    detail.text = content.detail
    (dot.background as GradientDrawable).setColor(if (content.attention) OverlayTheme.attn else OverlayTheme.brand)
    button.text = when (content.action) {
      BarAction.STOP -> "Stop"
      BarAction.RESUME -> "Resume"
      BarAction.ANSWER -> "Answer"
    }
    val filled = content.action != BarAction.STOP
    button.setTextColor(if (filled) OverlayTheme.onBrand else OverlayTheme.fg)
    (button.background as GradientDrawable).setColor(if (filled) OverlayTheme.brand else OverlayTheme.surfaceHigh)
  }

  private fun build() {
    val bar = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(context.dp(14), 0, context.dp(8), 0)
      background = GradientDrawable().apply {
        setColor(OverlayTheme.surface)
        cornerRadius = context.dp(16).toFloat()
      }
    }
    dot = View(context).apply { background = GradientDrawable().apply { shape = GradientDrawable.OVAL } }
    bar.addView(dot, LinearLayout.LayoutParams(context.dp(8), context.dp(8)).apply { marginEnd = context.dp(10) })
    val texts = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    title = TextView(context).apply {
      setTextColor(OverlayTheme.fg)
      textSize = 13f
      typeface = Typeface.DEFAULT_BOLD
      maxLines = 1
      ellipsize = android.text.TextUtils.TruncateAt.END
    }
    detail = TextView(context).apply {
      setTextColor(OverlayTheme.muted)
      textSize = 12f
      maxLines = 1
      ellipsize = android.text.TextUtils.TruncateAt.END
    }
    texts.addView(title)
    texts.addView(detail)
    bar.addView(texts, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    button = Button(context).apply {
      isAllCaps = false
      textSize = 13f
      minWidth = 0
      minimumWidth = 0
      setPadding(context.dp(16), 0, context.dp(16), 0)
      background = GradientDrawable().apply { cornerRadius = context.dp(999).toFloat() }
      setOnClickListener { onAction(action) }
    }
    bar.addView(button, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, context.dp(36)))
    val params = overlayParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      context.dp(BAR_DP),
      Gravity.TOP,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
    ).apply { y = topPx(context) }
    val frame = LinearLayout(context).apply {
      setPadding(context.dp(12), 0, context.dp(12), 0)
      addView(bar, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT))
    }
    windows.addView(frame, params)
    view = frame
  }

  fun hide() {
    view?.let { windows.removeView(it) }
    view = null
  }

  companion object {
    const val BAR_DP = 56

    fun topPx(context: Context): Int {
      val id = context.resources.getIdentifier("status_bar_height", "dimen", "android")
      return (if (id != 0) context.resources.getDimensionPixelSize(id) else 0) + context.dp(4)
    }

    fun heightFor(context: Context): Int = topPx(context) + context.dp(BAR_DP)

    fun rect(context: Context): IntArray = intArrayOf(0, topPx(context), context.resources.displayMetrics.widthPixels, heightFor(context))
  }
}

class TapOutline(private val context: Context) {
  private val windows = context.getSystemService(WindowManager::class.java)
  private var view: View? = null

  fun flash(bounds: IntArray, hideAfter: (Runnable, Long) -> Unit) {
    hide()
    val stroke = context.dp(3)
    val outline = View(context).apply {
      background = GradientDrawable().apply {
        setStroke(stroke, OverlayTheme.brand)
        cornerRadius = context.dp(8).toFloat()
        setColor(Color.TRANSPARENT)
      }
    }
    val params = overlayParams(
      bounds[2] - bounds[0] + stroke * 2,
      bounds[3] - bounds[1] + stroke * 2,
      Gravity.TOP or Gravity.START,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
    ).apply {
      x = bounds[0] - stroke
      y = bounds[1] - stroke
    }
    windows.addView(outline, params)
    view = outline
    hideAfter(Runnable { if (view === outline) hide() }, OUTLINE_MS)
  }

  fun hide() {
    view?.let { windows.removeView(it) }
    view = null
  }

  companion object {
    const val OUTLINE_MS = 800L
  }
}

class ServiceOverlays(private val context: Context) : Overlays {
  private val main = Handler(Looper.getMainLooper())
  private val panel = ConfirmPanel(context)
  private val outline = TapOutline(context)
  private var bar: FloatingBar? = null
  private var watch: TouchWatch? = null
  @Volatile
  private var closed = false
  @Volatile
  private var panelRect: IntArray? = null
  @Volatile
  private var barRect: IntArray? = null

  override val barHeight: Int get() = FloatingBar.heightFor(context)

  private fun onMain(block: () -> Unit) {
    main.post { if (!closed) block() }
  }

  override fun watchTouches(onTouch: () -> Unit) = onMain {
    if (watch == null) watch = TouchWatch(context, { listOfNotNull(panel.bounds, bar?.bounds) }, onTouch).also { it.show() }
  }

  override fun confirm(request: ConfirmRequest, answer: (ConfirmAnswer) -> Unit) {
    panelRect = lowerHalf()
    onMain { showConfirm(request, answer) }
  }

  private fun showConfirm(request: ConfirmRequest, answer: (ConfirmAnswer) -> Unit) {
    panel.show(request) { choice ->
      panelRect = null
      answer(choice)
    }
    panel.onPlaced { panelRect = it }
  }

  override fun hideConfirm() {
    panelRect = null
    onMain { panel.hide() }
  }

  override fun bar(content: BarContent, onAction: (BarAction) -> Unit) {
    if (barRect == null) barRect = FloatingBar.rect(context)
    onMain { showBar(content, onAction) }
  }

  private fun showBar(content: BarContent, onAction: (BarAction) -> Unit) {
    val shown = bar ?: FloatingBar(context, onAction).also { bar = it }
    val fresh = !shown.shown
    shown.show(content)
    if (fresh) shown.onPlaced { barRect = it }
  }

  override fun flash(bounds: IntArray) = onMain {
    outline.flash(bounds) { runnable, delay -> main.postDelayed({ if (!closed) runnable.run() }, delay) }
  }

  override fun ownRects(): List<IntArray> = listOfNotNull(panelRect, barRect)

  private fun lowerHalf(): IntArray {
    val screen = context.resources.displayMetrics
    return intArrayOf(0, screen.heightPixels / 2, screen.widthPixels, screen.heightPixels)
  }

  override fun close() {
    closed = true
    panelRect = null
    barRect = null
    main.post {
      watch?.hide()
      watch = null
      panel.hide()
      bar?.hide()
      bar = null
      outline.hide()
    }
  }
}
