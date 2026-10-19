package expo.modules.phonecontrol

import okhttp3.OkHttpClient
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

fun certificateFingerprint(der: ByteArray): String =
  "sha256/" + java.util.Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(der))

fun pinnedClient(fingerprint: String): OkHttpClient {
  val trustManager = object : X509TrustManager {
    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
      throw CertificateException("client certificates are not used")
    }

    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
      val leaf = chain?.firstOrNull() ?: throw CertificateException("empty certificate chain")
      if (certificateFingerprint(leaf.encoded) != fingerprint) throw CertificateException("certificate fingerprint mismatch")
    }

    override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
  }
  val context = SSLContext.getInstance("TLS")
  context.init(null, arrayOf(trustManager), java.security.SecureRandom())
  return OkHttpClient.Builder()
    .sslSocketFactory(context.socketFactory, trustManager)
    .hostnameVerifier { _, _ -> true }
    .pingInterval(15, TimeUnit.SECONDS)
    .build()
}
