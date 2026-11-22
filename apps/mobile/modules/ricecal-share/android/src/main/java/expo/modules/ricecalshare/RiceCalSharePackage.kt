package expo.modules.ricecalshare

import android.content.Context
import android.content.Intent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityHandler
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/**
 * Hooks [ShareIntent] into the main activity at the two moments an intent
 * arrives. Found by autolinking from the file name and the `Package` import.
 */
class RiceCalSharePackage : Package {
  /**
   * A cold start. Not `ReactActivityLifecycleListener.onCreate`, which Expo
   * calls after the activity delegate's own `onCreate`: in a dev client that
   * delegate is the dev launcher's, and it has decided what to do with the
   * launch intent by then. This notification comes before it, so the intent is
   * a deep link by the time anything reads it, in a dev client and a store build alike.
   */
  override fun createReactActivityHandlers(activityContext: Context?): List<ReactActivityHandler> =
    listOf(
      object : ReactActivityHandler {
        override fun onDidCreateReactActivityDelegateNotification(
          activity: ReactActivity?,
          delegate: ReactActivityDelegate?,
        ) {
          activity?.let { ShareIntent.rewrite(it, it.intent) }
        }
      },
    )

  /**
   * A share while the app is running. Every listener runs before React
   * Native's delegate is given the intent, so it emits the rewritten link as
   * a `url` event. False, so the delegate still gets it.
   */
  override fun createReactActivityLifecycleListeners(activityContext: Context?): List<ReactActivityLifecycleListener> =
    listOf(
      object : ReactActivityLifecycleListener {
        override fun onNewIntent(intent: Intent?): Boolean {
          activityContext?.let { ShareIntent.rewrite(it, intent) }
          return false
        }
      },
    )
}
