package expo.modules.phonecontrol

import org.json.JSONArray
import org.json.JSONObject

interface NodeView {
  val className: String
  val text: String?
  val description: String?
  val resourceId: String?
  val bounds: IntArray
  val clickable: Boolean
  val editable: Boolean
  val checkable: Boolean
  val checked: Boolean
  val scrollable: Boolean
  val focused: Boolean
  val password: Boolean
  val visible: Boolean
  fun children(): List<NodeView>
}

class UiTree(private val maxNodes: Int = MAX_NODES, private val maxText: Int = MAX_TEXT) {
  private var count = 0

  fun build(root: NodeView?): JSONArray {
    count = 0
    val nodes = JSONArray()
    if (root != null) node(root)?.let { nodes.put(it) }
    return nodes
  }

  private fun node(view: NodeView): JSONObject? {
    if (!view.visible || count >= maxNodes) return null
    count++
    val json = JSONObject()
      .put("id", count)
      .put("cls", view.className.substringAfterLast('.'))
      .put("bounds", JSONArray(view.bounds.toList()))
    if (!view.password) view.text?.takeIf { it.isNotEmpty() }?.let { json.put("text", it.take(maxText)) }
    view.description?.takeIf { it.isNotEmpty() }?.let { json.put("desc", it.take(maxText)) }
    view.resourceId?.takeIf { it.isNotEmpty() }?.let { json.put("res", it.substringAfter(":id/")) }
    if (view.clickable) json.put("click", true)
    if (view.editable) json.put("edit", true)
    if (view.checkable) json.put("check", true).put("checked", view.checked)
    if (view.scrollable) json.put("scroll", true)
    if (view.focused) json.put("focus", true)
    val kids = JSONArray()
    view.children().forEach { child -> node(child)?.let { kids.put(it) } }
    if (kids.length() > 0) json.put("kids", kids)
    return json
  }

  companion object {
    const val MAX_NODES = 1500
    const val MAX_TEXT = 500
  }
}

fun clickablePath(root: NodeView?, x: Int, y: Int): List<NodeView> {
  if (root == null || !root.visible || !contains(root.bounds, x, y)) return emptyList()
  for (child in root.children().asReversed()) {
    val below = clickablePath(child, x, y)
    if (below.isNotEmpty()) return listOf(root) + below
  }
  return if (root.clickable || root.checkable) listOf(root) else emptyList()
}

fun deepestClickable(root: NodeView?, x: Int, y: Int): NodeView? = clickablePath(root, x, y).lastOrNull()

fun targetLabel(path: List<NodeView>): String =
  path.asReversed().take(LABEL_LEVELS).map { labelOf(it) }.firstOrNull { it.isNotEmpty() } ?: ""

private const val LABEL_LEVELS = 3

fun labelOf(view: NodeView): String {
  val own = listOfNotNull(view.text?.takeUnless { view.password }, view.description).joinToString(" ").trim()
  if (own.isNotEmpty()) return own
  return view.children().map { labelOf(it) }.filter { it.isNotEmpty() }.joinToString(" ").take(200)
}

private fun contains(bounds: IntArray, x: Int, y: Int) = x >= bounds[0] && x < bounds[2] && y >= bounds[1] && y < bounds[3]
