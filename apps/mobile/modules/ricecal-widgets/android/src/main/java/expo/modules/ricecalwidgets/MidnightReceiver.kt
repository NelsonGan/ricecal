package expo.modules.ricecalwidgets

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The one thing that redraws a widget with the app asleep: the day ending.
 *
 * Every other redraw is pushed by the app, which is what `updatePeriodMillis="0"`
 * in each `rc_widget_info_*.xml` says. Midnight is the exception, because nothing
 * about the diary changes and yet everything on the card becomes wrong.
 * `WidgetStore.snapshot` already refuses a document describing a day that has
 * ended, but a `RemoteViews` tree the launcher is already holding does not
 * re-read anything, so without an alarm a phone left on a bedside table shows
 * last night's figures as this morning's. The second timeline entry in
 * `WidgetProvider.swift` prevents the same bug on iOS.
 *
 * Inexact (`AlarmManager.set`) rather than `setExactAndAllowWhileIdle`, so no
 * `SCHEDULE_EXACT_ALARM` permission: this is a card nobody is looking at, and
 * being late by a maintenance window costs nothing.
 */
class MidnightReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION) return
    // Redraws every placed widget against the new day, which reads as the
    // placeholder until the app publishes again — and arms tomorrow's alarm on
    // the way out, since `reloadAll` is what owns the schedule.
    WidgetStore.reloadAll(context)
  }

  companion object {
    const val ACTION = "expo.modules.ricecalwidgets.ROLL_OVER"
  }
}
