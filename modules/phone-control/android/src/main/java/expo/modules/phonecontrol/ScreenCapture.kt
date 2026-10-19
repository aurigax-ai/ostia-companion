package expo.modules.phonecontrol

import android.content.Context
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Handler
import android.util.DisplayMetrics
import android.view.Display
import java.io.ByteArrayOutputStream

class ScreenCapture(private val context: Context, private val projection: MediaProjection, private val handler: Handler) : FrameSource {
  private var reader: ImageReader? = null
  private var display: VirtualDisplay? = null
  private var latest: Image? = null
  override var size: DisplaySize = readDisplay()
    private set
  override var changed = false
    private set

  fun start() {
    val (width, height) = scaledSize(size.width, size.height, MAX_CAPTURE_SIDE)
    val fresh = newReader(width, height)
    display = projection.createVirtualDisplay(
      "ostia-phone-control",
      width,
      height,
      (size.density * DisplayMetrics.DENSITY_DEFAULT).toInt(),
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
      fresh.surface,
      null,
      handler,
    )
  }

  override fun follow(): Boolean {
    val next = readDisplay()
    if (next == size) return false
    size = next
    val (width, height) = scaledSize(next.width, next.height, MAX_CAPTURE_SIDE)
    val old = reader
    val fresh = newReader(width, height)
    display?.resize(width, height, (next.density * DisplayMetrics.DENSITY_DEFAULT).toInt())
    display?.surface = fresh.surface
    dropLatest()
    old?.close()
    return true
  }

  override fun capture(maxSide: Int, blocked: Boolean): Frame? {
    val image = latest ?: return null
    changed = false
    val plane = image.planes[0]
    val rowPixels = plane.rowStride / plane.pixelStride
    val full = Bitmap.createBitmap(rowPixels, image.height, Bitmap.Config.ARGB_8888)
    full.copyPixelsFromBuffer(plane.buffer.rewind())
    val (width, height) = scaledSize(image.width, image.height, maxSide)
    val cropped = Bitmap.createBitmap(full, 0, 0, image.width, image.height)
    val scaled = Bitmap.createScaledBitmap(cropped, width, height, true)
    if (blocked) scaled.eraseColor(android.graphics.Color.BLACK)
    val out = ByteArrayOutputStream()
    scaled.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
    listOf(full, cropped, scaled).distinct().forEach { it.recycle() }
    return Frame(width, height, size.width, size.height, out.toByteArray(), blocked)
  }

  override fun stop() {
    display?.release()
    display = null
    dropLatest()
    reader?.close()
    reader = null
  }

  private fun newReader(width: Int, height: Int): ImageReader {
    val fresh = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 3)
    fresh.setOnImageAvailableListener({ source ->
      if (source !== reader) return@setOnImageAvailableListener
      val image = try {
        source.acquireLatestImage()
      } catch (_: IllegalStateException) {
        null
      } ?: return@setOnImageAvailableListener
      latest?.close()
      latest = image
      changed = true
    }, handler)
    reader = fresh
    return fresh
  }

  private fun dropLatest() {
    latest?.close()
    latest = null
  }

  private fun readDisplay(): DisplaySize {
    val manager = context.getSystemService(DisplayManager::class.java)
    val screen = manager.getDisplay(Display.DEFAULT_DISPLAY)
    val metrics = DisplayMetrics()
    @Suppress("DEPRECATION")
    screen.getRealMetrics(metrics)
    return DisplaySize(metrics.widthPixels, metrics.heightPixels, metrics.density, screen.rotation * 90)
  }

  companion object {
    const val JPEG_QUALITY = 80
  }
}
