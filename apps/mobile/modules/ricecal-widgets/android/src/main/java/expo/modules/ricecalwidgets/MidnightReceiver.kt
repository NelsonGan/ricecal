package expo.modules.ricecalwidgets

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The one thing that redraws a widget with the app asleep: the day ending.
 *
 * EVERY OTHER REDRAW IS PUSHED BY THE APP, which is what `updatePeriodMillis="0"`
 * in each `rc_widget_info_*.xml` says: the figures only move when the diary
 * moves, so polling for them would be a second, slower answer to a question
 * already answered.
 *
 * Midnight is the exception, because nothing about the diary changes and yet
 * everything on the card becomes wrong. `WidgetStore.snapshot` already refuses a
 * document describing a day that has ended — but a `RemoteViews` tree the
 * launcher is already holding does not re-read anything, so without an alarm the
 * refusal is never consulted and a phone left on a bedside table shows last
 * night's calories, water and meals as this morning's until somebody opens the
 * app. That is the exact bug the second timeline entry in `WidgetProvider.swift`
 * exists to prevent on iOS; this is the Android half of it.
 *
 * Inexact (`AlarmManager.set`) rather than `setExactAndAllowWhileIdle`, and no
 * `SCHEDULE_EXACT_ALARM` permission with it. An exact alarm is for something a
 * user is waiting on at a particular second; this is for a card nobody is
 * looking at, and being late by a maintenance window costs nothing. A foreground
 * of the app fixes it sooner in any case.
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
