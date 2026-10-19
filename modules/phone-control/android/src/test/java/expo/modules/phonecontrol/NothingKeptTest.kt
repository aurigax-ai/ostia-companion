package expo.modules.phonecontrol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class NothingKeptTest {
  private val writers = listOf(
    "FileOutputStream", "FileWriter", "openFileOutput", "java.io.File", "cacheDir", "filesDir", "getExternal",
    "MediaStore", "SharedPreferences", "android.util.Log", "Log.", "println(", "printStackTrace", "System.out", "System.err",
  )

  @Test
  fun PHC_C16_noSourceWritesFilesOrLogs() {
    val sources = File("src/main/java").walkTopDown().filter { it.extension == "kt" }.toList()
    assertTrue(sources.isNotEmpty())
    val found = sources.flatMap { file -> writers.filter { it in file.readText() }.map { "${file.name}: $it" } }
    assertEquals(emptyList<String>(), found)
  }
}
