package expo.modules.ricecalwidgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

/**
 * The six receivers the system talks to, and the one line each of them adds.
 *
 * A provider is asked to redraw and answers with a `RemoteViews`; everything
 * about what goes in one is in `WidgetRenderer`. The split is deliberate: a
 * provider is a broadcast receiver with a lifecycle, and the drawing is a pure
 * function of a snapshot, which is what makes it possible to reason about
 * either without the other.
 */
abstract class RiceCalWidgetProvider : AppWidgetProvider() {
  protected abstract fun build(context: Context, snapshot: WidgetSnapshot?): RemoteViews

  final override fun onUpdate(
    context: Context,
    manager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    // Read ONCE for the whole batch rather than per widget. Two copies of the
    // same widget on two home screens are two ids in this array, and a phone
    // that had just crossed midnight could otherwise draw one of them against
    // yesterday and the other against the placeholder.
    val snapshot = WidgetStore.snapshot(context)
    val views = build(context, snapshot)
    for (id in appWidgetIds) manager.updateAppWidget(id, views)
  }
}

class KcalWidgetProvider : RiceCalWidgetProvider() {
  override fun build(context: Context, snapshot: WidgetSnapshot?) =
    WidgetRenderer.kcal(context, snapshot)
}

class WaterWidgetProvider : RiceCalWidgetProvider() {
  override fun build(context: Context, snapshot: WidgetSnapshot?) =
    WidgetRenderer.water(context, snapshot)
}

class WeightWidgetProvider : RiceCalWidgetProvider() {
  override fun build(context: Context, snapshot: WidgetSnapshot?) =
    WidgetRenderer.weight(context, snapshot)
}

class DayWidgetProvider : RiceCalWidgetProvider() {
  override fun build(context: Context, snapshot: WidgetSnapshot?) =
    WidgetRenderer.day(context, snapshot)
}

class QuickLogWidgetProvider : RiceCalWidgetProvider() {
  override fun build(context: Context, snapshot: WidgetSnapshot?) =
    WidgetRenderer.quickLog(context, snapshot)
}

class TodayWidgetProvider : RiceCalWidgetProvider() {
  override fun build(context: Context, snapshot: WidgetSnapshot?) =
    WidgetRenderer.today(context, snapshot)
}
