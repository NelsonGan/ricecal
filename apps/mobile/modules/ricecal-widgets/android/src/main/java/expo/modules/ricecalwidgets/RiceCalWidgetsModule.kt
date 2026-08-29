package expo.modules.ricecalwidgets

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The app's end of the widget store.
 *
 * The same five calls as the iOS module, and synchronous for the same reason:
 * each is a few bytes into `SharedPreferences`, written from a react-query
 * subscription that fires whenever the day changes.
 *
 * `installedWidgetsAsync` is async only to match the shape iOS needs, since
 * WidgetKit answers on a completion handler where `AppWidgetManager` answers
 * straight away.
 *
 * Every body goes through `withContext`, which is `?.let` rather than an early
 * `return@Function`: these lambdas are typed as returning a value, so a bare
 * return is a compile error rather than a no-op.
 */
class RiceCalWidgetsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RiceCalWidgets")

    Function("setSnapshot") { json: String ->
      withContext {
        WidgetStore.writeSnapshot(it, json)
        WidgetStore.reloadAll(it)
      }
    }

    Function("clearSnapshot") {
      withContext {
        WidgetStore.clear(it)
        WidgetStore.reloadAll(it)
      }
    }

    /**
     * How a widget tap addresses the app.
     *
     * Told rather than discovered, because the scheme moves with the build
     * variant — a development client registers `ricecal-dev://` — and nothing
     * inside a library module can read the app's own intent filters. Until this
     * has been called once, a tap falls back to simply launching the app.
     *
     * A no-op on iOS: the config plugin writes the same value into the widget
     * extension's Info.plist at prebuild time, because a widget with no snapshot
     * still has to be able to open the app and JS may never have run.
     */
    Function("setScheme") { scheme: String ->
      withContext { WidgetStore.writeScheme(it, scheme) }
    }

    Function("takePendingActions") { ->
      context()?.let { WidgetStore.takePendingActions(it) } ?: "[]"
    }

    // The element type is spelt out because `emptyList()` on its own gives the
    // compiler nothing to infer from, and the error it produces names the type
    // parameter rather than the call.
    AsyncFunction("installedWidgetsAsync") { ->
      context()?.let { WidgetStore.installed(it) } ?: emptyList<String>()
    }
  }

  /**
   * The Android context, or nothing.
   *
   * Null while the module is being torn down, which is a real state rather than
   * a defensive habit: `WidgetSync` writes on a react-query subscription, and a
   * reload during development can fire one after the host has gone.
   */
  private fun context(): Context? = appContext.reactContext

  private inline fun withContext(body: (Context) -> Unit) {
    context()?.let(body)
  }
}
