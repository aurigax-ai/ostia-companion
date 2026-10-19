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
}

class RequestHandler(private val level: String, private val screen: PhoneScreen) {
  fun handle(method: String, params: JSONObject): Reply = when (method) {
    "phone.capture" -> capture(params)
    "phone.stream" -> stream(params)
    "phone.stop" -> {
      screen.stopFromDesktop()
      Reply.Ok(JSONObject())
    }
    in INPUT_METHODS -> if (level == "view") fail("view-only") else fail("no-service")
    else -> Reply.Fail(RpcError(METHOD_NOT_FOUND, "method not found"))
  }

  private fun capture(params: JSONObject): Reply {
    val maxSide = optionalInt(params, "maxSide") ?: return Reply.Fail(LinkProtocol.badParams())
    val frame = screen.capture(LinkProtocol.clampSide(maxSide.takeIf { it > 0 })) ?: return fail("no-frame")
    return Reply.Ok(LinkProtocol.captureResult(frame, screen.foreground()))
  }

  private fun stream(params: JSONObject): Reply {
    val fps = optionalInt(params, "fps")?.takeIf { params.has("fps") } ?: return Reply.Fail(LinkProtocol.badParams())
    if (fps < 0 || fps > MAX_STREAM_FPS) return Reply.Fail(LinkProtocol.badParams())
    val maxSide = optionalInt(params, "maxSide") ?: return Reply.Fail(LinkProtocol.badParams())
    screen.stream(fps, LinkProtocol.clampSide(maxSide.takeIf { it > 0 }))
    return Reply.Ok(JSONObject())
  }

  private fun fail(code: String) = Reply.Fail(LinkProtocol.screenError(code))

  private fun optionalInt(params: JSONObject, key: String): Int? {
    if (!params.has(key) || params.isNull(key)) return 0
    val value = params.opt(key) as? Number ?: return null
    if (value.toDouble() != Math.floor(value.toDouble())) return null
    return value.toInt()
  }

  companion object {
    val INPUT_METHODS = setOf("phone.tap", "phone.swipe", "phone.type", "phone.key", "phone.launch", "phone.apps", "phone.tree")
  }
}
