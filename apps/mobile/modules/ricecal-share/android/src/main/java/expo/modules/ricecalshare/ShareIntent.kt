package expo.modules.ricecalshare

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri

/**
 * Turns "Share to RiceCal" into an ordinary deep link.
 *
 * Another app's share sheet starts the main activity with a SEND intent and
 * the post's text in EXTRA_TEXT, which React Native's Linking never looks at:
 * it reads only a VIEW intent's data. So the SEND intent is rewritten, in
 * place, into the VIEW intent a tap on `ricecal:///recipe/import?url=…` would
 * have produced, and the router opens the import screen the same way for both.
 *
 * In place rather than by `setIntent` with a copy, because the intent object
 * has already been handed to whoever runs before or after this; changing the
 * one object changes it for all of them.
 */
object ShareIntent {
  private const val SCHEME_META = "expo.modules.ricecalshare.SCHEME"

  /** True when [intent] was a share with a link in it and is now a deep link. */
  fun rewrite(context: Context, intent: Intent?): Boolean {
    if (intent?.action != Intent.ACTION_SEND) return false
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString() ?: return false
    // No link: left as it is, so the app simply opens.
    val link = ShareLink.firstWebUrl(text) ?: return false
    intent.action = Intent.ACTION_VIEW
    // `data` clears the `text/plain` type, which a VIEW of our scheme must not carry.
    intent.data = Uri.parse(ShareLink.importUrl(scheme(context), link))
    return true
  }

  /** The app's scheme, which the config plugin writes into the manifest from app.json. */
  private fun scheme(context: Context): String =
    try {
      @Suppress("DEPRECATION")
      context.packageManager
        .getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
        .metaData
        ?.getString(SCHEME_META)
    } catch (_: PackageManager.NameNotFoundException) {
      null
    } ?: "ricecal"
}
