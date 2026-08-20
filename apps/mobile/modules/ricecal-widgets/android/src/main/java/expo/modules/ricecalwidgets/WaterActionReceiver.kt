package expo.modules.ricecalwidgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/**
 * The +250 and +500 buttons, which log a drink WITHOUT opening the app.
 *
 * That is the whole point of the water widget, and it is why this is the only
 * widget tap on Android that is not a link. A button that launched the app,
 * waited for a session and then made a request would do nothing visible for two
 * seconds and might fail.
 *
 * So the drink is queued and the figure on the card moves, in one call, and the
 * app sends it the next time it is in front of somebody. See `addWater` in
 * `WidgetStore` and `useWidgetForeground` in `features/widgets/WidgetSync.tsx`.
 */
class WaterActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION) return
    val ml = intent.getIntExtra(EXTRA_ML, 0)
    if (ml <= 0) return

    /**
     * The day is taken HERE, at the tap, rather than when the app drains the
     * queue. A bottle finished at half past eleven belongs to that night, and
     * the app might not be opened until the morning.
     */
    WidgetStore.addWater(context, ml)

    // Only the water widgets. `reloadAll` would redraw six kinds for a change
    // that one of them shows, and a broadcast per provider is what that costs.
    val manager = AppWidgetManager.getInstance(context)
    val component = ComponentName(context, WaterWidgetProvider::class.java)
    val ids = manager.getAppWidgetIds(component)
    for (id in ids) {
      manager.updateAppWidget(id, WidgetRenderer.water(context, WidgetStore.snapshot(context)))
    }
  }

  companion object {
    private const val ACTION = "expo.modules.ricecalwidgets.ADD_WATER"
    private const val EXTRA_ML = "ml"

    /**
     * A tap, as a `PendingIntent`.
     *
     * `FLAG_UPDATE_CURRENT` because the two buttons differ only in an extra:
     * without it the system hands back the first intent it ever made for a
     * request code, and +500 would add 250. The request code carries the amount
     * for the same reason.
     */
    fun intent(context: Context, ml: Int): PendingIntent =
      PendingIntent.getBroadcast(
        context,
        ml,
        Intent(context, WaterActionReceiver::class.java).apply {
          action = ACTION
          putExtra(EXTRA_ML, ml)
          setPackage(context.packageName)
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
  }
}
