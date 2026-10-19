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

val TEST_CONFIG = SessionConfig(LinkTarget("desk.ts.net", 7443, "sha256/x", "tok"), "s1", "api", "Desk", 300, "control")
