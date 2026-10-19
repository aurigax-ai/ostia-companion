package expo.modules.phonecontrol

class Blocklist(ownPackage: String, autofillPackages: Set<String>, humanPackages: Set<String>) {
  private val blocked = BUILT_IN + autofillPackages + humanPackages + ownPackage

  fun blocks(packageName: String): Boolean = packageName in blocked

  companion object {
    val BUILT_IN = setOf(
      "com.android.systemui",
      "com.google.android.gms",
      "com.google.android.apps.walletnfcrel",
      "com.google.android.apps.authenticator2",
      "com.azure.authenticator",
      "com.authy.authy",
      "com.duosecurity.duomobile",
      "com.beemdevelopment.aegis",
      "org.fedorahosted.freeotp",
      "com.x8bit.bitwarden",
      "com.onepassword.android",
      "com.agilebits.onepassword",
      "com.lastpass.lpandroid",
      "com.dashlane",
      "com.kpassword.keepassdx",
      "com.kunzisoft.keepass.free",
      "com.kunzisoft.keepass.libre",
      "keepass2android.keepass2android",
      "proton.android.pass",
      "com.nordpass.android.app.password.manager",
      "com.enpass.app",
      "com.keepersecurity.passwordmanager",
      "com.paypal.android.p2pmobile",
    )
  }
}
