package expo.modules.phonecontrol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SafetyTest {
  private class Node(
    override val bounds: IntArray,
    override val text: String? = null,
    override val clickable: Boolean = false,
    override val checkable: Boolean = false,
    override val password: Boolean = false,
    override val visible: Boolean = true,
    private val kids: List<NodeView> = emptyList(),
  ) : NodeView {
    override val className = "android.widget.TextView"
    override val description: String? = null
    override val resourceId: String? = "com.example:id/name"
    override val editable = false
    override val checked = false
    override val scrollable = false
    override val focused = false
    override fun children() = kids
  }

  @Test
  fun PHC_C9_aHumanTouchPausesInputUntilResume() {
    val gate = SessionGate("control")
    assertNull(gate.refuseInput(true))
    assertTrue(gate.pause("human-touch"))
    assertEquals("paused", gate.refuseInput(true)?.message)
    assertEquals("paused" to "human-touch", gate.state())
    assertTrue(gate.resume())
    assertNull(gate.refuseInput(true))
  }

  @Test
  fun inputNeedsTheServiceAndAControlSession() {
    assertEquals("no-service", SessionGate("control").refuseInput(false)?.message)
    assertEquals("view-only", SessionGate("view").refuseInput(true)?.message)
    assertEquals("view-only", SessionGate("view").refuseRead(true)?.message)
    assertNull(SessionGate("control").refuseRead(true))
  }

  @Test
  fun PHC_C11_aBlockedAppInFrontRefusesInputAndReadsAsPaused() {
    val gate = SessionGate("control")
    assertTrue(gate.moveTo(Foreground("com.x8bit.bitwarden", "Bitwarden"), true))
    assertEquals("blocked-app", gate.refuseInput(true)?.message)
    assertEquals("paused" to "blocked-app", gate.state())
    assertNull(gate.refuseInput(true, leaving = true))
    assertTrue(gate.moveTo(Foreground("com.android.settings", "Settings"), false))
    assertNull(gate.refuseInput(true))
  }

  @Test
  fun PHC_C12_theCompanionSystemUiPasswordManagersAndTheHumansListAreBlocked() {
    val list = Blocklist("ai.aurigax.ostia", setOf("com.autofill.vault"), setOf("com.bank.app"))
    listOf("ai.aurigax.ostia", "com.android.systemui", "com.x8bit.bitwarden", "com.google.android.apps.authenticator2", "com.autofill.vault", "com.bank.app")
      .forEach { assertTrue(it, list.blocks(it)) }
    assertFalse(list.blocks("com.android.settings"))
  }

  @Test
  fun PHC_C13_changesAskFirst() {
    assertTrue(ConfirmPolicy.needsConfirm(TapTarget("com.android.settings", "Uninstall", false)))
    assertTrue(ConfirmPolicy.needsConfirm(TapTarget("com.android.settings", "Wi-Fi", true)))
    assertTrue(ConfirmPolicy.needsConfirm(TapTarget("com.google.android.packageinstaller", "OK", false)))
    assertTrue(ConfirmPolicy.needsConfirm(TapTarget("com.whatsapp", "Send message", false)))
    assertFalse(ConfirmPolicy.needsConfirm(TapTarget("com.android.settings", "Storage", false)))
    assertFalse(ConfirmPolicy.needsConfirm(TapTarget("com.android.settings", "Sending history", false)))
  }

  @Test
  fun theTreeLeavesOutPasswordsHiddenNodesAndShortensIds() {
    val root = Node(
      intArrayOf(0, 0, 100, 100),
      kids = listOf(
        Node(intArrayOf(0, 0, 50, 50), text = "hunter2", password = true),
        Node(intArrayOf(0, 50, 50, 100), text = "hidden", visible = false),
        Node(intArrayOf(50, 0, 100, 50), text = "Storage", clickable = true),
      ),
    )
    val nodes = UiTree().build(root)
    val kids = nodes.getJSONObject(0).getJSONArray("kids")
    assertEquals(2, kids.length())
    assertFalse(kids.getJSONObject(0).has("text"))
    assertEquals("Storage", kids.getJSONObject(1).getString("text"))
    assertEquals("name", kids.getJSONObject(1).getString("res"))
    assertTrue(kids.getJSONObject(1).getBoolean("click"))
  }

  @Test
  fun theTreeStopsAtItsNodeLimit() {
    val root = Node(intArrayOf(0, 0, 10, 10), kids = List(10) { Node(intArrayOf(0, 0, 1, 1)) })
    assertEquals(4, UiTree(maxNodes = 5).build(root).getJSONObject(0).getJSONArray("kids").length())
  }

  @Test
  fun aTapTargetIsTheDeepestClickableNodeLabelledByItsText() {
    val button = Node(intArrayOf(10, 10, 90, 40), clickable = true, kids = listOf(Node(intArrayOf(12, 12, 80, 30), text = "Uninstall")))
    val root = Node(intArrayOf(0, 0, 100, 100), kids = listOf(button))
    val target = deepestClickable(root, 20, 20)!!
    assertEquals("Uninstall", labelOf(target))
    assertNull(deepestClickable(root, 95, 95))
  }

  @Test
  fun aControlWithoutTextTakesTheLabelOfItsRow() {
    val switch = Node(intArrayOf(80, 10, 95, 40), checkable = true)
    val row = Node(intArrayOf(0, 10, 100, 40), kids = listOf(Node(intArrayOf(5, 10, 70, 40), text = "All Drive notifications"), switch))
    val root = Node(intArrayOf(0, 0, 100, 100), kids = listOf(row))
    assertEquals("All Drive notifications", targetLabel(clickablePath(root, 85, 20)))
    assertTrue(ConfirmPolicy.needsConfirm(TapTarget("com.android.settings", "Disable", false)))
  }
}
