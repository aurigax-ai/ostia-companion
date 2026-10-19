package expo.modules.phonecontrol

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
  fun reply(id: Any, result: JSONObject)
  fun fail(id: Any, error: RpcError)
  fun send(text: String)
  fun sendFrame(bytes: ByteArray): Boolean
  fun close()
}

interface SessionHost {
  fun publish(status: SessionStatus)
  fun finished()
}

class PhoneSession(
  private val config: SessionConfig,
  val endsAt: Long,
  private val clock: () -> Long,
  private val scheduler: Scheduler,
  private val host: SessionHost,
) : LinkListener, PhoneScreen {
  private val requests = RequestHandler(config.level, this)
  private var source: FrameSource? = null
  private var link: Link? = null
  private var screenId: String? = null
  private var streamFps = 0
  private var streamSide = MAX_CAPTURE_SIDE
  private var streamSeq = 0L
  private var streamTask: Cancellable? = null
  var ended = false
    private set

  fun start(frames: FrameSource, open: (LinkListener) -> Link) {
    source = frames
    publish("starting")
    scheduler.postDelayed(maxOf(0L, endsAt - clock())) { stop("time-limit") }
    link = open(this).also { it.open() }
  }

  fun startParams(): StartParams {
    val size = source?.size ?: DisplaySize(0, 0, 1f, 0)
    return StartParams(config.sessionId, config.label, size.width, size.height, size.density, size.rotation, config.level, config.limitSec, endsAt, 0, null)
  }

  fun displayChanged() {
    val frames = source ?: return
    if (frames.follow() && screenId != null) link?.send(LinkProtocol.stateEvent("running", null, frames.size, endsAt))
  }

  private fun expired(): Boolean {
    if (clock() < endsAt) return false
    stop("time-limit")
    return true
  }

  override fun onLinked(screenId: String) = scheduler.post {
    if (ended) return@post
    this.screenId = screenId
    publish("running")
  }

  override fun onRefused(reason: String) = scheduler.post { stop(reason, notifyDesktop = false) }

  override fun onRequest(request: Incoming.Request) = scheduler.post {
    if (ended || expired()) return@post
    when (val reply = requests.handle(request.method, request.params)) {
      is Reply.Ok -> link?.reply(request.id, reply.result)
      is Reply.Fail -> link?.fail(request.id, reply.error)
    }
  }

  override fun onEvent(event: Incoming.Event) = Unit

  override fun onClosed(code: Int) = scheduler.post { stop(closeReason(code), notifyDesktop = false) }

  override fun capture(maxSide: Int): Frame? = source?.capture(maxSide, false)

  override fun foreground(): Foreground = Foreground("", "")

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
      frames.capture(streamSide, false)?.let { frame ->
        if (link?.sendFrame(LinkProtocol.frameBytes(streamSeq, frame)) == true) streamSeq++
      }
    }
    streamTask = scheduler.postDelayed(1000L / streamFps) { streamTick() }
  }

  override fun stopFromDesktop() = scheduler.post { stop("stop-desktop") }

  fun stop(reason: String, notifyDesktop: Boolean = true) {
    if (ended) return
    ended = true
    scheduler.clear()
    val size = source?.size
    if (notifyDesktop && screenId != null && size != null) link?.send(LinkProtocol.stateEvent("stopped", reason, size, endsAt))
    link?.close()
    link = null
    source?.stop()
    source = null
    host.publish(SessionStatus("stopped", reason, endsAt, screenId, config.sessionId))
    host.finished()
  }

  private fun publish(state: String) {
    host.publish(SessionStatus(state, null, endsAt, screenId, config.sessionId))
  }
}
