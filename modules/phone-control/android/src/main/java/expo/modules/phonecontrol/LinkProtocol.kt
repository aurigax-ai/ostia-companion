package expo.modules.phonecontrol

import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

const val FRAME_SCREEN = 0x10
const val SCREEN_ERROR = -32010
const val METHOD_NOT_FOUND = -32601
const val INVALID_PARAMS = -32602
const val UNAUTHENTICATED = -32001
const val CLOSE_REVOKED = 4003
const val CLOSE_TIME_LIMIT = 4005
const val CLOSE_NO_CONTROLLER = 4006
const val MAX_CAPTURE_SIDE = 1600
const val MIN_CAPTURE_SIDE = 64
const val MAX_STREAM_FPS = 5

sealed class Incoming {
  data class Request(val id: Any, val method: String, val params: JSONObject) : Incoming()
  data class Response(val id: Int, val result: JSONObject?, val error: RpcError?) : Incoming()
  data class Event(val type: String, val payload: JSONObject) : Incoming()
  object Invalid : Incoming()
}

data class RpcError(val code: Int, val message: String, val data: JSONObject? = null)

data class Frame(
  val width: Int,
  val height: Int,
  val screenWidth: Int,
  val screenHeight: Int,
  val jpeg: ByteArray,
  val blocked: Boolean,
)

object LinkProtocol {
  fun parse(text: String): Incoming {
    val message = try {
      JSONObject(text)
    } catch (_: Exception) {
      return Incoming.Invalid
    }
    val method = message.optString("method", "")
    if (method == "event") {
      val params = message.optJSONObject("params") ?: return Incoming.Invalid
      return Incoming.Event(params.optString("type", ""), params.optJSONObject("payload") ?: JSONObject())
    }
    val id = message.opt("id")
    if (method.isNotEmpty()) {
      if (id == null || id == JSONObject.NULL) return Incoming.Invalid
      return Incoming.Request(id, method, message.optJSONObject("params") ?: JSONObject())
    }
    if (id !is Int) return Incoming.Invalid
    val error = message.optJSONObject("error")?.let {
      RpcError(it.optInt("code"), it.optString("message", ""), it.optJSONObject("data"))
    }
    return Incoming.Response(id, message.optJSONObject("result"), error)
  }

  fun request(id: Int, method: String, params: JSONObject): String =
    JSONObject().put("jsonrpc", "2.0").put("id", id).put("method", method).put("params", params).toString()

  fun result(id: Any, result: JSONObject): String =
    JSONObject().put("jsonrpc", "2.0").put("id", id).put("result", result).toString()

  fun error(id: Any, error: RpcError): String {
    val body = JSONObject().put("code", error.code).put("message", error.message)
    error.data?.let { body.put("data", it) }
    return JSONObject().put("jsonrpc", "2.0").put("id", id).put("error", body).toString()
  }

  fun event(type: String, payload: JSONObject): String =
    JSONObject()
      .put("jsonrpc", "2.0")
      .put("method", "event")
      .put("params", JSONObject().put("type", type).put("payload", payload))
      .toString()

  fun hello(id: Int, deviceToken: String): String =
    request(id, "hello", JSONObject().put("deviceToken", deviceToken).put("client", "ostia-companion/1.0 phone-control"))

  fun start(id: Int, start: StartParams): String =
    request(
      id,
      "screen.start",
      JSONObject()
        .put("sessionId", start.sessionId)
        .put("width", start.width)
        .put("height", start.height)
        .put("density", start.density)
        .put("rotation", start.rotation)
        .put("level", start.level)
        .put("limitSec", start.limitSec)
        .put("endsAt", start.endsAt)
        .put("overlayHeight", start.overlayHeight)
        .put("label", start.label)
        .apply { start.agent?.let { put("agent", it) } },
    )

  fun captureResult(frame: Frame, foreground: Foreground): JSONObject =
    JSONObject()
      .put("width", frame.width)
      .put("height", frame.height)
      .put("screenWidth", frame.screenWidth)
      .put("screenHeight", frame.screenHeight)
      .put("mime", "image/jpeg")
      .put("data", java.util.Base64.getEncoder().encodeToString(frame.jpeg))
      .put("blocked", frame.blocked)
      .put("foreground", JSONObject().put("package", foreground.packageName).put("label", foreground.label))

  fun frameBytes(seq: Long, frame: Frame): ByteArray {
    val header = JSONObject()
      .put("seq", seq)
      .put("width", frame.width)
      .put("height", frame.height)
      .put("screenWidth", frame.screenWidth)
      .put("screenHeight", frame.screenHeight)
      .put("blocked", frame.blocked)
      .toString()
      .toByteArray(Charsets.UTF_8)
    val out = ByteArrayOutputStream(1 + 4 + header.size + frame.jpeg.size)
    out.write(FRAME_SCREEN)
    out.write(ByteBuffer.allocate(4).putInt(header.size).array())
    out.write(header)
    out.write(frame.jpeg)
    return out.toByteArray()
  }

  fun stateEvent(state: String, reason: String?, display: DisplaySize, endsAt: Long): String =
    event(
      "screen.state",
      JSONObject()
        .put("state", state)
        .apply { reason?.let { put("reason", it) } }
        .put("width", display.width)
        .put("height", display.height)
        .put("rotation", display.rotation)
        .put("endsAt", endsAt),
    )

  fun screenError(code: String, reason: String? = null): RpcError =
    RpcError(SCREEN_ERROR, code, reason?.let { JSONObject().put("reason", it) })

  fun badParams(): RpcError = RpcError(SCREEN_ERROR, "bad-params")

  fun clampSide(value: Int?): Int = (value ?: MAX_CAPTURE_SIDE).coerceIn(MIN_CAPTURE_SIDE, MAX_CAPTURE_SIDE)

  fun point(value: Any?): IntArray? {
    val array = value as? JSONArray ?: return null
    if (array.length() != 2) return null
    val x = array.opt(0) as? Number ?: return null
    val y = array.opt(1) as? Number ?: return null
    return intArrayOf(x.toInt(), y.toInt())
  }
}

data class DisplaySize(val width: Int, val height: Int, val density: Float, val rotation: Int)

data class Foreground(val packageName: String, val label: String)

data class StartParams(
  val sessionId: String,
  val label: String,
  val width: Int,
  val height: Int,
  val density: Float,
  val rotation: Int,
  val level: String,
  val limitSec: Int,
  val endsAt: Long,
  val overlayHeight: Int,
  val agent: String?,
)

fun closeReason(code: Int): String = when (code) {
  CLOSE_REVOKED -> "revoked"
  CLOSE_TIME_LIMIT -> "time-limit"
  CLOSE_NO_CONTROLLER -> "no-controller"
  else -> "link-closed"
}

fun scaledSize(width: Int, height: Int, maxSide: Int): Pair<Int, Int> {
  val longest = maxOf(width, height)
  if (longest <= maxSide) return width to height
  val scale = maxSide.toDouble() / longest
  return maxOf(1, Math.round(width * scale).toInt()) to maxOf(1, Math.round(height * scale).toInt())
}
