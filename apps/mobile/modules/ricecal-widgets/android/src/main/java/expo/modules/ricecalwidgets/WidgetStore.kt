package expo.modules.ricecalwidgets

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * The one thing the app and the widgets both touch.
 *
 * The Android twin of `RiceCalWidgetStore.swift`, and it holds the same three
 * things for the same reasons: the snapshot the app publishes, the drinks a
 * widget logged and the app still owes the server, and the scheme a tap needs
 * to address the app with.
 *
 * SharedPreferences rather than an App Group, because Android has no such
 * concept — a widget provider runs in this app's own process and reads this
 * app's own preferences. Which makes the Android half of this markedly simpler
 * than the iOS half, and is why there is no config plugin on this side.
 */
object WidgetStore {
  private const val PREFS = "ricecal_widgets"
  private const val KEY_SNAPSHOT = "snapshot"
  private const val KEY_PENDING = "pendingActions"
  private const val KEY_SCHEME = "scheme"

  /** The only version this build understands. See `version` in `types.ts`. */
  const val SUPPORTED_VERSION = 1

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  // MARK: the snapshot

  fun writeSnapshot(context: Context, json: String) {
    prefs(context).edit().putString(KEY_SNAPSHOT, json).apply()
  }

  fun clear(context: Context) {
    prefs(context).edit().remove(KEY_SNAPSHOT).remove(KEY_PENDING).apply()
  }

  /**
   * What the app published, or null.
   *
   * Three ways to get null and they are deliberately one answer, the same as on
   * iOS: nothing published yet, a document this build is too old to read, and a
   * document describing a day that has ended. The third is the one worth
   * naming — a phone left alone overnight would otherwise present yesterday's
   * total as this morning's, and a widget cannot recompute anything.
   */
  fun snapshot(context: Context): WidgetSnapshot? {
    val json = prefs(context).getString(KEY_SNAPSHOT, null) ?: return null
    val parsed = WidgetSnapshot.parse(json) ?: return null
    if (parsed.version != SUPPORTED_VERSION) return null
    return if (parsed.date == todayKey()) parsed else null
  }

  // MARK: how a tap addresses the app

  fun writeScheme(context: Context, scheme: String) {
    prefs(context).edit().putString(KEY_SCHEME, scheme).apply()
  }

  /**
   * The deep link a widget tap opens, or null before the app has ever run.
   *
   * The scheme is not a constant because the development build is a separate
   * app with its own (`ricecal-dev`), so a widget built with the store build's
   * scheme would open the other one. The app tells us on startup; until it has,
   * a tap falls back to simply launching the app, which is what `launchIntent`
   * below is for.
   */
  fun link(context: Context, target: String, widget: String): Intent {
    val scheme = prefs(context).getString(KEY_SCHEME, null)
    if (scheme.isNullOrEmpty()) return launchIntent(context)

    val uri = Uri.parse("$scheme://widget/$target?w=$widget")
    return Intent(Intent.ACTION_VIEW, uri).apply {
      // Explicit, so a link this app minted cannot be answered by another app
      // that happens to have registered the same scheme.
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
  }

  /** Open the app, wherever it was. What a widget with nothing to say does. */
  fun launchIntent(context: Context): Intent =
    context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?.apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
      ?: Intent()

  // MARK: water added on a widget

  /**
   * Queue a drink and move the figure the widget is showing, together.
   *
   * The two writes are one action for the reason the Swift twin gives: a queued
   * action without the bump is a button that appears to do nothing until the
   * app is next opened, and a bump without the queued action is a drink the
   * server never hears about.
   */
  fun addWater(context: Context, ml: Int, date: String = todayKey(), at: Long = System.currentTimeMillis()) {
    val store = prefs(context)
    val queue = JSONArray(store.getString(KEY_PENDING, null) ?: "[]")
    queue.put(
      JSONObject().apply {
        put("type", "water")
        put("ml", ml)
        put("date", date)
        put("at", at)
      }
    )
    store.edit().putString(KEY_PENDING, queue.toString()).apply()

    bumpWater(context, ml)
  }

  /** Read the queue and empty it. The app's half of `addWater`. */
  fun takePendingActions(context: Context): String {
    val store = prefs(context)
    val json = store.getString(KEY_PENDING, null) ?: "[]"
    store.edit().remove(KEY_PENDING).apply()
    return json
  }

  /**
   * Move the water figure in the stored snapshot, in place.
   *
   * The whole document is rewritten rather than an override kept beside it,
   * because the widget reads exactly one document and a second source of truth
   * would be a third place for the tank to disagree with the app.
   *
   * `label` is formatted here, which is the one exception to the rule that the
   * app formats and the widget draws. The button runs with the app asleep, so
   * there is nobody else to ask.
   */
  private fun bumpWater(context: Context, ml: Int) {
    val store = prefs(context)
    val json = store.getString(KEY_SNAPSHOT, null) ?: return
    val document = runCatching { JSONObject(json) }.getOrNull() ?: return
    val water = document.optJSONObject("water") ?: return

    val next = (water.optInt("ml") + ml).coerceAtLeast(0)
    val goal = water.optInt("goalMl")
    water.put("ml", next)
    water.put("label", NumberFormat.getIntegerInstance().format(next))
    water.put("fraction", if (goal > 0) (next.toDouble() / goal).coerceAtMost(1.0) else 0.0)
    document.put("water", water)

    store.edit().putString(KEY_SNAPSHOT, document.toString()).apply()
  }

  // MARK: redrawing

  /**
   * Redraw every RiceCal widget on every home screen.
   *
   * Pushed rather than broadcast: `ACTION_APPWIDGET_UPDATE` is a protected
   * broadcast only the system may send, so an app that tries gets a
   * `SecurityException` and the widgets never move, which reads as the snapshot
   * not being written.
   *
   * `updateAppWidget(ComponentName, RemoteViews)` needs no broadcast and no
   * permission, at the cost of having to know how to draw, which is why it goes
   * through `WidgetRenderer`.
   *
   * One call per provider, because there is no "everything this package
   * publishes" form.
   */
  fun reloadAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val snapshot = snapshot(context)

    for (kind in WidgetKind.values()) {
      val component = ComponentName(context, kind.provider)
      // Nothing placed, nothing to draw. Skipped rather than rendered into the
      // void: the ring and the weight chart are bitmaps, and drawing six of
      // them for an empty home screen on every write is not free.
      if (manager.getAppWidgetIds(component).isEmpty()) continue
      manager.updateAppWidget(component, WidgetRenderer.render(context, kind, snapshot))
    }

    scheduleRollover(context)
  }

  /**
   * Book the next midnight, or cancel one that is no longer worth waking for.
   *
   * Owned here rather than by the receiver, because every path that redraws a
   * widget goes through this file: the app publishing, a provider being asked
   * to update (which is also what a reboot and a newly placed widget produce),
   * and the alarm itself firing. Booking it in one of those and not the others
   * is a schedule that survives until the first time it matters.
   *
   * The alarm is replaced rather than added to — one `PendingIntent`, one
   * request code — so calling this on every write is not a queue of alarms.
   *
   * See `MidnightReceiver` for why this exists at all and why it is inexact.
   */
  fun scheduleRollover(context: Context) {
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val pending = PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, MidnightReceiver::class.java).apply {
        action = MidnightReceiver.ACTION
        setPackage(context.packageName)
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    // Nothing on any home screen: cancel rather than keep waking to redraw
    // nothing. Removing the last widget does not itself reach this — a provider
    // hears `onDeleted`, not `onUpdate` — so the alarm that is already booked
    // fires once more, finds an empty home screen and cancels itself here.
    if (installed(context).isEmpty()) {
      alarms.cancel(pending)
      return
    }

    // Five seconds past, not on the stroke. `todayKey` is read when the alarm
    // fires and a wake-up a millisecond early would read the day that is ending.
    val at = Calendar.getInstance().apply {
      add(Calendar.DAY_OF_YEAR, 1)
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 5)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    alarms.set(AlarmManager.RTC, at, pending)
  }

  /** Which widgets are on a home screen right now, in the app's own words. */
  fun installed(context: Context): List<String> {
    val manager = AppWidgetManager.getInstance(context)
    return WidgetKind.values()
      .filter { manager.getAppWidgetIds(ComponentName(context, it.provider)).isNotEmpty() }
      .map { it.reported }
  }

  /** `yyyy-MM-dd` in the phone's own zone, which is the key the app writes. */
  fun todayKey(now: Date = Date()): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US).format(now)
}

/**
 * The six widgets, and the two names each of them has.
 *
 * `provider` is the receiver the system keys a widget on; `reported` is the word
 * the app and Mixpanel use. Kept apart for the reason `WidgetKind` in the
 * module's `types.ts` gives, and this is the only place the translation happens.
 */
enum class WidgetKind(val provider: Class<*>, val reported: String) {
  KCAL(KcalWidgetProvider::class.java, "kcal"),
  WATER(WaterWidgetProvider::class.java, "water"),
  WEIGHT(WeightWidgetProvider::class.java, "weight"),
  DAY(DayWidgetProvider::class.java, "day"),
  QUICK_LOG(QuickLogWidgetProvider::class.java, "quick_log"),
  TODAY(TodayWidgetProvider::class.java, "today"),
}
