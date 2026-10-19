package expo.modules.phonecontrol

enum class WindowKind { APP, SYSTEM, KEYBOARD, OVERLAY, OTHER }

class WindowView(val kind: WindowKind, val packageName: String?, val bounds: IntArray, val active: Boolean, val root: NodeView?)

object Windows {
  fun foreground(windows: List<WindowView>): WindowView? =
    windows.firstOrNull { it.active && it.kind != WindowKind.OVERLAY } ?: windows.firstOrNull { it.kind == WindowKind.APP }

  fun shownBlocked(windows: List<WindowView>, blocklist: Blocklist): Boolean {
    val front = foreground(windows) ?: return true
    if (blocks(front, blocklist)) return true
    return windows.any { it.kind == WindowKind.APP && blocks(it, blocklist) }
  }

  fun at(windows: List<WindowView>, x: Int, y: Int): WindowView? =
    windows.firstOrNull { it.kind != WindowKind.OVERLAY && inside(it.bounds, x, y) }

  fun blocks(window: WindowView, blocklist: Blocklist): Boolean {
    val name = window.packageName ?: return true
    return blocklist.blocks(name)
  }

  fun target(window: WindowView, x: Int, y: Int): TapTarget? {
    val path = clickablePath(window.root, x, y)
    val node = path.lastOrNull() ?: return null
    return TapTarget(window.packageName ?: "", targetLabel(path).take(MAX_LABEL), node.checkable, node.bounds.toList())
  }

  fun inside(bounds: IntArray, x: Int, y: Int) = bounds.size == 4 && x >= bounds[0] && x < bounds[2] && y >= bounds[1] && y < bounds[3]

  private const val MAX_LABEL = 120
}

class OwnGestures(private val slackMs: Long = SLACK_MS) {
  private val starts = ArrayDeque<Long>()

  fun started(at: Long, offsets: List<Long>) {
    offsets.forEach { starts.addLast(at + it) }
    while (starts.size > MAX_KEPT) starts.removeFirst()
  }

  fun isOwn(at: Long): Boolean = starts.any { at >= it - EARLY_MS && at <= it + slackMs }

  companion object {
    const val SLACK_MS = 250L
    const val EARLY_MS = 50L
    const val MAX_KEPT = 16
  }
}

object TextEdit {
  fun insert(current: String, start: Int, end: Int, typed: String): Pair<String, Int> {
    val (from, to) = range(current, start, end)
    return current.substring(0, from) + typed + current.substring(to) to from + typed.length
  }

  fun deleteBack(current: String, start: Int, end: Int): Pair<String, Int> {
    val (from, to) = range(current, start, end)
    if (from != to) return current.substring(0, from) + current.substring(to) to from
    if (from == 0) return current to 0
    val before = Character.offsetByCodePoints(current, from, -1)
    return current.substring(0, before) + current.substring(from) to before
  }

  private fun range(current: String, start: Int, end: Int): Pair<Int, Int> {
    if (start < 0 || end < 0) return current.length to current.length
    val from = minOf(start, end).coerceIn(0, current.length)
    val to = maxOf(start, end).coerceIn(0, current.length)
    return from to to
  }
}
