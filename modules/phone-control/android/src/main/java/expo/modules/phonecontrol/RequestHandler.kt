package expo.modules.phonecontrol

import org.json.JSONObject

sealed class Reply {
  data class Ok(val result: JSONObject) : Reply()
  data class Fail(val error: RpcError) : Reply()
}

interface PhoneScreen {
  fun capture(maxSide: Int): Frame?
  fun foreground(): Foreground
  fun stream(fps: Int, maxSide: Int)
  fun stopFromDesktop()
  fun inputRefusal(leaving: Boolean): RpcError?
  fun readRefusal(): RpcError?
  fun tap(x: Int, y: Int, count: Int, holdMs: Int, done: (Reply) -> Unit)
  fun swipe(from: IntArray, to: IntArray, durationMs: Int, done: (Reply) -> Unit)
  fun type(text: String): Reply
  fun key(key: String, done: (Reply) -> Unit)
  fun launch(packageName: String): Reply
  fun apps(): Reply
  fun tree(): Reply
}

class RequestHandler(private val screen: PhoneScreen) {
  fun handle(method: String, params: JSONObject, done: (Reply) -> Unit) {
    when (method) {
      "phone.capture" -> done(capture(params))
      "phone.stream" -> done(stream(params))
      "phone.stop" -> {
        screen.stopFromDesktop()
        done(Reply.Ok(JSONObject()))
      }
      "phone.apps", "phone.tree" -> done(screen.readRefusal()?.let { Reply.Fail(it) } ?: if (method == "phone.apps") screen.apps() else screen.tree())
      in INPUT_METHODS -> {
        val refusal = screen.inputRefusal(method == "phone.key" && params.opt("key") == "home")
        if (refusal != null) done(Reply.Fail(refusal)) else input(method, params, done)
      }
      else -> done(Reply.Fail(RpcError(METHOD_NOT_FOUND, "method not found")))
    }
  }

  private fun input(method: String, params: JSONObject, done: (Reply) -> Unit) {
    when (method) {
      "phone.tap" -> {
        val x = whole(params, "x", 0, MAX_COORD)
        val y = whole(params, "y", 0, MAX_COORD)
        val count = whole(params, "count", 1, 2, 1)
        val hold = whole(params, "holdMs", 0, 3000, 0)
        if (x == null || y == null || count == null || hold == null) done(bad()) else screen.tap(x, y, count, hold, done)
      }
      "phone.swipe" -> {
        val from = LinkProtocol.point(params.opt("from"))
        val to = LinkProtocol.point(params.opt("to"))
        val duration = whole(params, "durationMs", 50, 3000, 300)
        if (from == null || to == null || duration == null || !inside(from) || !inside(to)) done(bad())
        else screen.swipe(from, to, duration, done)
      }
      "phone.type" -> {
        val text = params.opt("text") as? String
        done(if (text == null || text.length > MAX_TYPE) bad() else screen.type(text))
      }
      "phone.key" -> {
        val key = params.opt("key") as? String
        if (key == null || key !in KEYS) done(bad()) else screen.key(key, done)
      }
      "phone.launch" -> {
        val name = params.opt("package") as? String
        done(if (name == null || !PACKAGE.matches(name)) bad() else screen.launch(name))
      }
    }
  }

  private fun capture(params: JSONObject): Reply {
    val maxSide = whole(params, "maxSide", 1, Int.MAX_VALUE, MAX_CAPTURE_SIDE) ?: return bad()
    val frame = screen.capture(LinkProtocol.clampSide(maxSide)) ?: return Reply.Fail(LinkProtocol.screenError("no-frame"))
    return Reply.Ok(LinkProtocol.captureResult(frame, screen.foreground()))
  }

  private fun stream(params: JSONObject): Reply {
    if (!params.has("fps")) return bad()
    val fps = whole(params, "fps", 0, MAX_STREAM_FPS) ?: return bad()
    val maxSide = whole(params, "maxSide", 1, Int.MAX_VALUE, MAX_CAPTURE_SIDE) ?: return bad()
    screen.stream(fps, LinkProtocol.clampSide(maxSide))
    return Reply.Ok(JSONObject())
  }

  private fun bad() = Reply.Fail(LinkProtocol.badParams())

  private fun inside(point: IntArray) = point.all { it in 0..MAX_COORD }

  private fun whole(params: JSONObject, key: String, min: Int, max: Int, missing: Int? = null): Int? {
    if (!params.has(key) || params.isNull(key)) return missing
    val value = params.opt(key) as? Number ?: return null
    val number = value.toDouble()
    if (number != Math.floor(number) || number < min || number > max) return null
    return number.toInt()
  }

  companion object {
    val INPUT_METHODS = setOf("phone.tap", "phone.swipe", "phone.type", "phone.key", "phone.launch")
    val KEYS = setOf("back", "home", "recents", "enter", "delete", "tab")
    val PACKAGE = Regex("^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+)+$")
    const val MAX_TYPE = 4000
    const val MAX_COORD = 20000
  }
}
