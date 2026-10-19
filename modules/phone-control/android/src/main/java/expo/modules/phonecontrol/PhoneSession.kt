package expo.modules.phonecontrol

import org.json.JSONArray
import org.json.JSONObject

fun interface Cancellable {
  fun cancel()
}

interface Scheduler {
  fun post(task: () -> Unit)
  fun postDelayed(delayMs: Long, task: () -> Unit): Cancellable
  fun clear()
}

interface FrameSource {
  val size: DisplaySize
  val changed: Boolean
  fun capture(maxSide: Int, blocked: Boolean): Frame?
  fun follow(): Boolean
  fun stop()
}

interface Link {
  fun open()
  fun call(method: String, params: JSONObject, answer: (Incoming.Response) -> Unit)
  fun reply(id: Any, result: JSONObject)
  fun fail(id: Any, error: RpcError)
  fun send(text: String)
  fun sendFrame(bytes: ByteArray): Boolean
  fun close()
}

interface SessionHost {
  fun publish(status: SessionStatus)
  fun openAsk(ask: AskLine)
  fun finished()
}

interface FieldView {
  val packageName: String
  val text: String
  val selectionStart: Int
  val selectionEnd: Int
  val password: Boolean
  val multiLine: Boolean
  val label: String
  fun setText(text: String, cursor: Int): Boolean
  fun enter(): Boolean
  fun next(): Boolean
}

interface Device {
  fun windows(): List<WindowView>
  fun label(packageName: String): String
  fun tap(x: Int, y: Int, count: Int, holdMs: Int, done: (Boolean) -> Unit): List<Long>
  fun swipe(from: IntArray, to: IntArray, durationMs: Int, done: (Boolean) -> Unit): List<Long>
  fun field(): FieldView?
  fun global(key: String): Boolean
  fun launch(packageName: String): Boolean
  fun launcherApps(): List<Pair<String, String>>
}

data class ConfirmRequest(val agent: String, val what: String, val appLabel: String, val allowForSession: Boolean)

interface Overlays {
  val barHeight: Int
  fun watchTouches(onTouch: () -> Unit)
  fun bar(content: BarContent, onAction: (BarAction) -> Unit)
  fun flash(bounds: IntArray)
  fun confirm(request: ConfirmRequest, answer: (ConfirmAnswer) -> Unit)
  fun hideConfirm()
  fun ownRects(): List<IntArray>
  fun close()
}

enum class ConfirmAnswer { ALLOW_ONCE, ALLOW_SESSION, DENY }

class PhoneSession(
  private val config: SessionConfig,
  val endsAt: Long,
  private val clock: () -> Long,
  private val scheduler: Scheduler,
  private val host: SessionHost,
  private val blocklist: Blocklist,
  private val ownPackage: String,
) : LinkListener, PhoneScreen {
  private val requests = RequestHandler(this)
  private val gate = SessionGate(config.level)
  private val own = OwnGestures()
  private val allowed = mutableSetOf<String>()
  private val asks = AskTracker(config.sessionId)
  private var lastAction: String? = null
  private var source: FrameSource? = null
  private var link: Link? = null
  private var device: Device? = null
  private var overlays: Overlays? = null
  private var screenId: String? = null
  private var streamFps = 0
  private var streamSide = MAX_CAPTURE_SIDE
  private var streamSeq = 0L
  private var streamTask: Cancellable? = null
  @Volatile
  var ended = false
    private set
  val attached get() = device != null
  val sessionId get() = config.sessionId
  val label get() = config.label

  fun start(frames: FrameSource, open: (LinkListener) -> Link) {
    source = frames
    publish("starting")
    scheduler.postDelayed(maxOf(0L, endsAt - clock())) { stop("time-limit") }
    link = open(this).also { it.open() }
  }

  fun startParams(): StartParams {
    val size = source?.size ?: DisplaySize(0, 0, 1f, 0)
    return StartParams(config.sessionId, config.label, size.width, size.height, size.density, size.rotation, config.level, config.limitSec, endsAt, overlays?.barHeight ?: 0, null)
  }

  fun attach(device: Device, overlays: Overlays) {
    if (ended || this.device != null) return
    this.device = device
    if (config.level == "control") {
      this.overlays = overlays
      overlays.watchTouches {
        val at = clock()
        scheduler.post { humanTouch(at) }
      }
      barTick()
    }
    followForeground()
  }

  private fun barTick() {
    if (ended || expired()) return
    refreshBar()
    scheduler.postDelayed(BAR_TICK_MS) { barTick() }
  }

  private fun refreshBar() {
    val bar = overlays ?: return
    val content = BarModel.content(config.agentName, gate.state(), gate.foreground.label, lastAction, BarModel.timeLeft(endsAt, clock()), asks.first())
    bar.bar(content) { action -> scheduler.post { barAction(action) } }
  }

  private fun barAction(action: BarAction) {
    if (ended) return
    when (action) {
      BarAction.STOP -> stop("stop-phone")
      BarAction.RESUME -> resume()
      BarAction.ANSWER -> asks.first()?.let { host.openAsk(it) }
    }
  }

  private fun did(action: String) {
    lastAction = action
    refreshBar()
  }

  fun serviceOff() {
    if (device != null) stop("service-off")
  }

  fun windowsChanged() = followForeground()

  fun screenOff() = pause("screen-off")

  fun resume() {
    if (gate.resume()) stateChanged()
  }

  fun displayChanged() {
    val frames = source ?: return
    if (frames.follow()) stateChanged()
  }

  private fun expired(): Boolean {
    if (clock() < endsAt) return false
    stop("time-limit")
    return true
  }

  private fun humanTouch(at: Long) {
    if (ended || device == null || own.isOwn(at)) return
    if (gate.foreground.packageName == ownPackage) return
    pause("human-touch")
  }

  private fun pause(reason: String) {
    if (gate.pause(reason)) stateChanged()
  }

  private fun followForeground() {
    val now = device ?: return
    val windows = now.windows()
    val name = Windows.foreground(windows)?.packageName ?: ""
    val label = if (name == gate.foreground.packageName) gate.foreground.label else if (name.isEmpty()) "" else now.label(name)
    if (!gate.moveTo(Foreground(name, label), Windows.shownBlocked(windows, blocklist))) return
    link?.send(LinkProtocol.event("screen.foreground", JSONObject().put("package", name).put("label", label).put("blocked", gate.foregroundBlocked)))
    stateChanged()
  }

  private fun screenBlocked(): Boolean {
    if (device == null) return true
    followForeground()
    return gate.foregroundBlocked
  }

  private fun stateChanged() {
    refreshBar()
    val (state, reason) = gate.state()
    val size = source?.size
    if (screenId != null && size != null) link?.send(LinkProtocol.stateEvent(state, reason, size, endsAt))
    publish(if (state == "paused" && reason == "blocked-app") "running" else state, reason)
  }

  override fun onLinked(screenId: String) = scheduler.post {
    if (ended) return@post
    this.screenId = screenId
    stateChanged()
    link?.call("ask.list", JSONObject()) { answer ->
      scheduler.post {
        asks.load(answer.result?.optJSONArray("asks"))
        refreshBar()
      }
    }
  }

  override fun onRefused(reason: String) = scheduler.post { stop(reason, notifyDesktop = false) }

  override fun onRequest(request: Incoming.Request) = scheduler.post {
    if (ended || expired()) return@post
    requests.handle(request.method, request.params) { reply ->
      scheduler.post {
        when (reply) {
          is Reply.Ok -> link?.reply(request.id, reply.result)
          is Reply.Fail -> link?.fail(request.id, reply.error)
        }
      }
    }
  }

  override fun onEvent(event: Incoming.Event) = scheduler.post {
    if (ended) return@post
    when (event.type) {
      "ask.created" -> event.payload.optJSONObject("ask")?.let { asks.add(it) }
      "ask.resolved" -> asks.resolve(event.payload.optString("askId", ""))
      else -> return@post
    }
    refreshBar()
  }

  override fun onClosed(code: Int) = scheduler.post { stop(closeReason(code), notifyDesktop = false) }

  override fun capture(maxSide: Int): Frame? = source?.capture(maxSide, screenBlocked())

  override fun foreground(): Foreground = gate.foreground

  override fun stream(fps: Int, maxSide: Int) {
    streamFps = fps
    streamSide = maxSide
    streamTask?.cancel()
    streamTask = null
    if (fps > 0) streamTask = scheduler.postDelayed(0) { streamTick() }
  }

  private fun streamTick() {
    if (ended || streamFps <= 0 || expired()) return
    val frames = source ?: return
    if (frames.changed) {
      frames.capture(streamSide, screenBlocked())?.let { frame ->
        if (link?.sendFrame(LinkProtocol.frameBytes(streamSeq, frame)) == true) streamSeq++
      }
    }
    streamTask = scheduler.postDelayed(1000L / streamFps) { streamTick() }
  }

  override fun stopFromDesktop() = scheduler.post { stop("stop-desktop") }

  override fun inputRefusal(leaving: Boolean): RpcError? {
    if (expired()) return LinkProtocol.screenError("no-service")
    followForeground()
    return gate.refuseInput(device != null, leaving)
  }

  override fun readRefusal(): RpcError? {
    if (expired()) return LinkProtocol.screenError("no-service")
    return gate.refuseRead(device != null)
  }

  private fun pointRefusal(now: Device, vararg points: IntArray): RpcError? {
    val windows = now.windows()
    val mine = overlays?.ownRects().orEmpty()
    for ((x, y) in points.map { it[0] to it[1] }) {
      if (mine.any { Windows.inside(it, x, y) }) return blockedError()
      val window = Windows.at(windows, x, y) ?: return blockedError()
      if (Windows.blocks(window, blocklist)) return blockedError()
    }
    return null
  }

  private fun targetAt(now: Device, x: Int, y: Int): TapTarget? = Windows.at(now.windows(), x, y)?.let { Windows.target(it, x, y) }

  override fun tap(x: Int, y: Int, count: Int, holdMs: Int, done: (Reply) -> Unit) {
    val now = device ?: return done(fail("no-service"))
    pointRefusal(now, intArrayOf(x, y))?.let { return done(Reply.Fail(it)) }
    val target = targetAt(now, x, y)
    val land = {
      val result = JSONObject().apply { target?.let { put("target", JSONObject().put("text", it.label).put("package", it.packageName)) } }
      gesture(done, result, {
        did(BarModel.tapped(target?.label ?: ""))
        overlays?.flash(target?.bounds?.takeIf { it.size == 4 }?.toIntArray() ?: intArrayOf(x - TAP_RING, y - TAP_RING, x + TAP_RING, y + TAP_RING))
      }) { finish -> now.tap(x, y, count, holdMs, finish) }
    }
    if (target == null || !ConfirmPolicy.needsConfirm(target)) return land()
    val key = ConfirmPolicy.allowKey(target)
    if (key != null && key in allowed) return land()
    val what = if (target.label.isNotEmpty()) "tap “${target.label}”" else "tap a control"
    askFirst(what, target.packageName, key, done, recheck = {
      pointRefusal(now, intArrayOf(x, y)) ?: if (targetAt(now, x, y) != target) LinkProtocol.screenError("changed") else null
    }, act = land)
  }

  override fun swipe(from: IntArray, to: IntArray, durationMs: Int, done: (Reply) -> Unit) {
    val now = device ?: return done(fail("no-service"))
    pointRefusal(now, from, to)?.let { return done(Reply.Fail(it)) }
    gesture(done, JSONObject(), { did("swiped") }) { finish -> now.swipe(from, to, durationMs, finish) }
  }

  private fun gesture(done: (Reply) -> Unit, result: JSONObject, landed: () -> Unit, dispatch: ((Boolean) -> Unit) -> List<Long>) {
    val at = clock()
    val strokes = dispatch { ok ->
      scheduler.post {
        if (ended) return@post
        if (ok) landed()
        done(if (ok) Reply.Ok(result) else fail("cancelled"))
      }
    }
    own.started(at, strokes)
  }

  override fun type(text: String): Reply {
    val field = editableField() ?: return fail("no-field")
    if (blocklist.blocks(field.packageName)) return Reply.Fail(blockedError())
    val (next, cursor) = TextEdit.insert(field.text, field.selectionStart, field.selectionEnd, text)
    if (!field.setText(next, cursor)) return fail("cancelled")
    did(BarModel.typed(text.length))
    return Reply.Ok(JSONObject())
  }

  private fun editableField(): FieldView? = device?.field()?.takeUnless { it.password }

  override fun key(key: String, done: (Reply) -> Unit) {
    val now = device ?: return done(fail("no-service"))
    when (key) {
      "back", "home", "recents" -> done(outcome(now.global(key)).also { if (it is Reply.Ok) did("pressed $key") })
      "delete" -> {
        val field = editableField() ?: return done(fail("no-field"))
        val (next, cursor) = TextEdit.deleteBack(field.text, field.selectionStart, field.selectionEnd)
        done(outcome(field.setText(next, cursor)))
      }
      "tab" -> done(editableField()?.let { outcome(it.next()) } ?: fail("no-field"))
      "enter" -> enter(done)
      else -> done(Reply.Fail(LinkProtocol.badParams()))
    }
  }

  private fun enter(done: (Reply) -> Unit) {
    val field = editableField() ?: return done(fail("no-field"))
    if (blocklist.blocks(field.packageName)) return done(Reply.Fail(blockedError()))
    if (field.multiLine) return done(outcome(field.enter()))
    val key = ConfirmPolicy.enterKey(field.packageName, field.label)
    if (key != null && key in allowed) return done(outcome(field.enter()))
    val what = if (field.label.isNotEmpty()) "press Enter in “${field.label}”" else "press Enter"
    askFirst(what, field.packageName, key, done, recheck = {
      val again = editableField()
      if (again == null || again.packageName != field.packageName || again.label != field.label) LinkProtocol.screenError("changed") else null
    }, act = { done(editableField()?.let { outcome(it.enter()) } ?: fail("no-field")) })
  }

  private fun askFirst(what: String, packageName: String, allowKey: String?, done: (Reply) -> Unit, recheck: () -> RpcError?, act: () -> Unit) {
    val panel = overlays ?: return done(fail("declined"))
    val now = device ?: return done(fail("no-service"))
    gate.confirming = true
    stateChanged()
    var settled = false
    var timeout: Cancellable? = null
    fun settle(answer: ConfirmAnswer) {
      if (settled || ended) return
      settled = true
      timeout?.cancel()
      panel.hideConfirm()
      gate.confirming = false
      stateChanged()
      if (answer == ConfirmAnswer.DENY) return done(fail("declined"))
      val refusal = inputRefusal(false) ?: recheck()
      if (refusal != null) return done(Reply.Fail(refusal))
      if (answer == ConfirmAnswer.ALLOW_SESSION && allowKey != null) allowed.add(allowKey)
      act()
    }
    timeout = scheduler.postDelayed(CONFIRM_TIMEOUT_MS) { settle(ConfirmAnswer.DENY) }
    panel.confirm(ConfirmRequest(config.agentName, what, now.label(packageName), allowKey != null)) { answer -> scheduler.post { settle(answer) } }
  }

  override fun launch(packageName: String): Reply {
    val now = device ?: return fail("no-service")
    if (blocklist.blocks(packageName)) return Reply.Fail(blockedError())
    if (!now.launch(packageName)) return fail("not-found")
    did("opened ${now.label(packageName)}")
    return Reply.Ok(JSONObject())
  }

  override fun apps(): Reply {
    val now = device ?: return fail("no-service")
    val apps = now.launcherApps().filterNot { blocklist.blocks(it.first) }.map { JSONObject().put("package", it.first).put("label", it.second) }
    return Reply.Ok(JSONObject().put("apps", JSONArray(apps)))
  }

  override fun tree(): Reply {
    val now = device ?: return fail("no-service")
    val windows = now.windows()
    val front = Windows.foreground(windows)
    val packageName = front?.packageName ?: ""
    if (front == null || Windows.shownBlocked(windows, blocklist)) return Reply.Ok(JSONObject().put("package", packageName).put("nodes", JSONArray()))
    return Reply.Ok(JSONObject().put("package", packageName).put("nodes", UiTree().build(front.root)))
  }

  private fun outcome(ok: Boolean) = if (ok) Reply.Ok(JSONObject()) else fail("cancelled")

  private fun fail(code: String) = Reply.Fail(LinkProtocol.screenError(code))

  private fun blockedError() = LinkProtocol.screenError("blocked-app")

  fun stop(reason: String, notifyDesktop: Boolean = true) {
    if (ended) return
    ended = true
    scheduler.clear()
    val size = source?.size
    if (notifyDesktop && screenId != null && size != null) link?.send(LinkProtocol.stateEvent("stopped", reason, size, endsAt))
    link?.close()
    link = null
    overlays?.close()
    overlays = null
    device = null
    source?.stop()
    source = null
    allowed.clear()
    host.publish(SessionStatus("stopped", reason, endsAt, screenId, config.sessionId))
    host.finished()
  }

  private fun publish(state: String, reason: String? = null) {
    host.publish(SessionStatus(state, reason, endsAt, screenId, config.sessionId))
  }

  companion object {
    const val CONFIRM_TIMEOUT_MS = 60_000L
    const val BAR_TICK_MS = 1000L
    const val TAP_RING = 40
  }
}
