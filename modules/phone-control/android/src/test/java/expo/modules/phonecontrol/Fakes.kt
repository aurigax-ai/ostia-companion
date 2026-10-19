package expo.modules.phonecontrol

import org.json.JSONObject

class FakeClock(var now: Long = 1_000_000L) : () -> Long {
  override fun invoke() = now
}

class FakeScheduler(private val clock: FakeClock) : Scheduler {
  private class Task(val at: Long, val order: Long, val run: () -> Unit) {
    var cancelled = false
  }

  private val tasks = mutableListOf<Task>()
  private var order = 0L

  override fun post(task: () -> Unit) {
    postDelayed(0, task)
  }

  override fun postDelayed(delayMs: Long, task: () -> Unit): Cancellable {
    val entry = Task(clock.now + delayMs, order++, task)
    tasks.add(entry)
    return Cancellable { entry.cancelled = true }
  }

  override fun clear() {
    tasks.forEach { it.cancelled = true }
    tasks.clear()
  }

  fun runDue() {
    while (true) {
      val next = tasks.filter { !it.cancelled && it.at <= clock.now }.minWithOrNull(compareBy({ it.at }, { it.order })) ?: return
      tasks.remove(next)
      next.run()
    }
  }

  fun advance(ms: Long) {
    val until = clock.now + ms
    while (true) {
      val next = tasks.filter { !it.cancelled && it.at <= until }.minWithOrNull(compareBy({ it.at }, { it.order }))
      if (next == null) {
        clock.now = until
        return
      }
      clock.now = maxOf(clock.now, next.at)
      tasks.remove(next)
      next.run()
    }
  }
}

class FakeFrames(override var size: DisplaySize = DisplaySize(1080, 2400, 2.75f, 0)) : FrameSource {
  override var changed = true
  var stopped = false
  val blockedAsks = mutableListOf<Boolean>()

  override fun capture(maxSide: Int, blocked: Boolean): Frame {
    blockedAsks.add(blocked)
    return Frame(720, 1600, size.width, size.height, if (blocked) byteArrayOf(0) else byteArrayOf(7, 7), blocked)
  }

  override fun follow() = false

  override fun stop() {
    stopped = true
  }
}

class FakeLink(var room: Boolean = true) : Link {
  var opened = false
  var closed = false
  val sent = mutableListOf<String>()
  val frames = mutableListOf<ByteArray>()
  val replies = mutableMapOf<Any, JSONObject>()
  val failures = mutableMapOf<Any, RpcError>()

  override fun open() {
    opened = true
  }

  override fun reply(id: Any, result: JSONObject) {
    replies[id] = result
  }

  override fun fail(id: Any, error: RpcError) {
    failures[id] = error
  }

  override fun send(text: String) {
    sent.add(text)
  }

  override fun sendFrame(bytes: ByteArray): Boolean {
    if (!room) return false
    frames.add(bytes)
    return true
  }

  override fun close() {
    closed = true
  }

  fun events(type: String): List<JSONObject> =
    sent.map { JSONObject(it) }.filter { it.optString("method") == "event" && it.getJSONObject("params").getString("type") == type }
      .map { it.getJSONObject("params").getJSONObject("payload") }
}

class FakeHost : SessionHost {
  val statuses = mutableListOf<SessionStatus>()
  var finished = false

  override fun publish(status: SessionStatus) {
    statuses.add(status)
  }

  override fun finished() {
    finished = true
  }
}

fun request(id: Any, method: String, params: JSONObject = JSONObject()) = Incoming.Request(id, method, params)

fun testConfig(level: String = "control") =
  SessionConfig(LinkTarget("desk.ts.net", 7443, "sha256/x", "tok"), "s1", "api", "Desk", "claude", 300, level, emptySet())

val TEST_CONFIG = testConfig()

const val OWN = "ai.aurigax.ostia"

val TEST_BLOCKLIST = Blocklist(OWN, emptySet(), setOf("com.bank.app"))

class TestNode(
  override val bounds: IntArray,
  override val text: String? = null,
  override val clickable: Boolean = false,
  override val checkable: Boolean = false,
  private val kids: List<NodeView> = emptyList(),
) : NodeView {
  override val className = "android.widget.Button"
  override val description: String? = null
  override val resourceId: String? = null
  override val editable = false
  override val checked = false
  override val scrollable = false
  override val focused = false
  override val password = false
  override val visible = true
  override fun children() = kids
}

fun appWindow(packageName: String?, vararg kids: NodeView, bounds: IntArray = intArrayOf(0, 0, 1080, 2400), active: Boolean = true) =
  WindowView(WindowKind.APP, packageName, bounds, active, TestNode(bounds, kids = kids.toList()))

fun button(label: String, l: Int, t: Int, r: Int, b: Int, checkable: Boolean = false) =
  TestNode(intArrayOf(l, t, r, b), text = label, clickable = true, checkable = checkable)

class FakeField(
  override var packageName: String = "com.chat",
  override var text: String = "",
  override var selectionStart: Int = -1,
  override var selectionEnd: Int = -1,
  override var password: Boolean = false,
  override var multiLine: Boolean = false,
  override var label: String = "Message",
) : FieldView {
  var entered = 0

  override fun setText(text: String, cursor: Int): Boolean {
    this.text = text
    selectionStart = cursor
    selectionEnd = cursor
    return true
  }

  override fun enter(): Boolean {
    entered++
    return true
  }

  override fun next() = true
}

class FakeDevice(var windows: List<WindowView> = listOf(appWindow("com.android.settings"))) : Device {
  val taps = mutableListOf<List<Int>>()
  val swipes = mutableListOf<List<Int>>()
  var pending: ((Boolean) -> Unit)? = null
  var field: FakeField? = null
  var finishAtOnce = true

  override fun windows() = windows
  override fun label(packageName: String) = packageName.substringAfterLast('.').replaceFirstChar { it.uppercase() }

  override fun tap(x: Int, y: Int, count: Int, holdMs: Int, done: (Boolean) -> Unit): List<Long> {
    taps.add(listOf(x, y, count, holdMs))
    if (finishAtOnce) done(true) else pending = done
    return (0 until count).map { it * 150L }
  }

  override fun swipe(from: IntArray, to: IntArray, durationMs: Int, done: (Boolean) -> Unit): List<Long> {
    swipes.add(from.toList() + to.toList() + durationMs)
    if (finishAtOnce) done(true) else pending = done
    return listOf(0L)
  }

  override fun field() = field
  override fun global(key: String) = true
  override fun launch(packageName: String) = true
  override fun launcherApps() = listOf("com.android.settings" to "Settings", "com.bank.app" to "Bank", OWN to "Ostia")
}

class FakeOverlays : Overlays {
  var onTouch: (() -> Unit)? = null
  var asked: ConfirmRequest? = null
  var answer: ((ConfirmAnswer) -> Unit)? = null
  var rects = listOf<IntArray>()
  var closed = false

  override fun watchTouches(onTouch: () -> Unit) {
    this.onTouch = onTouch
  }

  override fun confirm(request: ConfirmRequest, answer: (ConfirmAnswer) -> Unit) {
    asked = request
    this.answer = answer
  }

  override fun hideConfirm() {
    asked = null
  }

  override fun ownRects() = rects

  override fun close() {
    closed = true
  }
}
