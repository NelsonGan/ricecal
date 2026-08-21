package expo.modules.ricecalwidgets

import android.app.PendingIntent
import android.content.Context
import android.view.View
import android.widget.RemoteViews

/**
 * What each of the six widgets actually draws.
 *
 * One object rather than a method per provider, because the six share more than
 * they differ: the same placeholder, the same tap handling, the same rule that
 * the app has already decided every number and this only lays them out. See the
 * header of `types.ts` in the module for that rule and why it is absolute.
 *
 * `PROGRESS_SCALE` is what a fraction becomes. `setProgressBar` takes integers,
 * so 0..1 is drawn as 0..1000 — a hundredth of a bar is a tenth of a pixel at
 * these sizes, and a scale of 100 visibly stepped on the wide macro bars.
 */
object WidgetRenderer {
  private const val PROGRESS_SCALE = 1000

  /**
   * Whichever of the six this is.
   *
   * The providers call their own function directly, because each one knows what
   * it is; this exists for `WidgetStore.reloadAll`, which is holding a
   * `WidgetKind` and has to draw all of them.
   */
  fun render(context: Context, kind: WidgetKind, snapshot: WidgetSnapshot?): RemoteViews =
    when (kind) {
      WidgetKind.KCAL -> kcal(context, snapshot)
      WidgetKind.WATER -> water(context, snapshot)
      WidgetKind.WEIGHT -> weight(context, snapshot)
      WidgetKind.DAY -> day(context, snapshot)
      WidgetKind.QUICK_LOG -> quickLog(context, snapshot)
      WidgetKind.TODAY -> today(context, snapshot)
    }

  fun kcal(context: Context, snapshot: WidgetSnapshot?): RemoteViews {
    if (snapshot == null) return placeholder(context, WidgetKind.KCAL)
    if (!snapshot.hasBudget) return noBudget(context, WidgetKind.KCAL)

    val views = RemoteViews(context.packageName, R.layout.rc_widget_kcal)
    views.setTextViewText(R.id.rc_kcal_caption, if (snapshot.kcal.over) "KCAL OVER" else "KCAL LEFT")
    views.setTextViewText(R.id.rc_kcal_value, snapshot.kcal.left)
    views.setTextViewText(R.id.rc_kcal_of, "of ${snapshot.kcal.budget}")

    // Two bars in one frame, and the day picks which. There is no remotable
    // tint below API 31, so a bar's colour is the drawable it was inflated
    // with — see the note in the layout.
    val bar = if (snapshot.kcal.over) R.id.rc_kcal_bar_over else R.id.rc_kcal_bar
    val hidden = if (snapshot.kcal.over) R.id.rc_kcal_bar else R.id.rc_kcal_bar_over
    views.setViewVisibility(bar, View.VISIBLE)
    views.setViewVisibility(hidden, View.GONE)
    progress(views, bar, snapshot.kcal.fraction)

    // Unlike iOS, the two tiles here really are two: an Android widget has
    // never been limited to one click target the way a `systemSmall` WidgetKit
    // widget is.
    //
    // The CARD is a target as well, and it is not redundant. Android dispatches
    // a tap to the deepest clickable view under it, so the tiles still win their
    // own taps; what this catches is everything between and around them, which
    // would otherwise be dead space on a card that looks tappable all over.
    views.setOnClickPendingIntent(R.id.rc_kcal_root, open(context, "open", WidgetKind.KCAL))
    views.setOnClickPendingIntent(R.id.rc_kcal_snap, open(context, "camera", WidgetKind.KCAL))
    views.setOnClickPendingIntent(R.id.rc_kcal_search, open(context, "search", WidgetKind.KCAL))
    return views
  }

  fun water(context: Context, snapshot: WidgetSnapshot?): RemoteViews {
    if (snapshot == null) return placeholder(context, WidgetKind.WATER)

    val views = RemoteViews(context.packageName, R.layout.rc_widget_water)
    views.setTextViewText(R.id.rc_water_value, snapshot.water.label)
    views.setTextViewText(R.id.rc_water_goal, snapshot.water.goalLabel)
    progress(views, R.id.rc_water_bar, snapshot.water.fraction)

    // A broadcast rather than a link. The whole point of this widget is that a
    // drink is logged without the app being opened at all.
    //
    // And NO card-wide tap under them, unlike every other widget here: with two
    // buttons on a 110dp square, a tap that missed one is far more likely to be
    // a miss than a request to open the app, and opening the app is the one
    // outcome this widget exists to avoid.
    views.setOnClickPendingIntent(R.id.rc_water_add_250, WaterActionReceiver.intent(context, 250))
    views.setOnClickPendingIntent(R.id.rc_water_add_500, WaterActionReceiver.intent(context, 500))
    return views
  }

  fun weight(context: Context, snapshot: WidgetSnapshot?): RemoteViews {
    if (snapshot == null) return placeholder(context, WidgetKind.WEIGHT)

    // Signed in and never weighed. Not the same as having no snapshot, and not
    // something a chart of zeros can stand in for.
    val weight = snapshot.weight
      ?: return message(
        context,
        WidgetKind.WEIGHT,
        "No weigh-ins",
        "Record one and the trend starts here.",
      )

    val views = RemoteViews(context.packageName, R.layout.rc_widget_weight)
    views.setTextViewText(R.id.rc_weight_value, weight.value)
    views.setTextViewText(R.id.rc_weight_unit, weight.unit)
    views.setTextViewText(R.id.rc_weight_change, weight.change)
    // Kaya on a gain, pandan on a loss, which is what the weight list on Trends
    // does with the same figure. The direction is the app's answer rather than
    // this widget's: see `up` in the module's `types.ts`.
    views.setTextColor(
      R.id.rc_weight_change,
      context.getColor(if (weight.up) R.color.rc_kaya_ink else R.color.rc_pandan_ink),
    )
    // Empty on a window that has not moved: a pill saying nothing changed is a
    // pill worth not drawing.
    views.setViewVisibility(
      R.id.rc_weight_change,
      if (weight.change.isEmpty()) View.INVISIBLE else View.VISIBLE,
    )
    views.setTextViewText(R.id.rc_weight_caption, "${weight.weeks.size} week average")
    views.setImageViewBitmap(
      R.id.rc_weight_bars,
      WidgetBitmaps.bars(context, widthDp = 138, heightDp = 64, values = weight.weeks),
    )
    // The whole card, because nothing on this one is a control. Weight is
    // recorded on Trends, which is where `weight` resolves to.
    views.setOnClickPendingIntent(R.id.rc_weight_root, open(context, "weight", WidgetKind.WEIGHT))
    return views
  }

  fun day(context: Context, snapshot: WidgetSnapshot?): RemoteViews {
    if (snapshot == null) return placeholder(context, WidgetKind.DAY)
    if (!snapshot.hasBudget) return noBudget(context, WidgetKind.DAY)

    val views = RemoteViews(context.packageName, R.layout.rc_widget_day)
    views.setImageViewBitmap(
      R.id.rc_day_ring,
      WidgetBitmaps.ring(
        context,
        sizeDp = 124,
        fraction = snapshot.kcal.fraction,
        over = snapshot.kcal.over,
        value = snapshot.kcal.left,
        caption = if (snapshot.kcal.over) "KCAL OVER" else "KCAL LEFT",
      ),
    )
    views.setTextViewText(
      R.id.rc_day_total,
      "${snapshot.kcal.eaten} of ${snapshot.kcal.budget} kcal",
    )
    progress(views, R.id.rc_day_carbs, snapshot.macros.carbs.fraction)
    progress(views, R.id.rc_day_protein, snapshot.macros.protein.fraction)
    progress(views, R.id.rc_day_fat, snapshot.macros.fat.fraction)

    views.setOnClickPendingIntent(R.id.rc_day_root, open(context, "open", WidgetKind.DAY))
    views.setOnClickPendingIntent(R.id.rc_day_snap, open(context, "camera", WidgetKind.DAY))
    views.setOnClickPendingIntent(R.id.rc_day_search, open(context, "search", WidgetKind.DAY))
    return views
  }

  fun quickLog(context: Context, snapshot: WidgetSnapshot?): RemoteViews {
    if (snapshot == null) return placeholder(context, WidgetKind.QUICK_LOG)

    val views = RemoteViews(context.packageName, R.layout.rc_widget_quick_log)
    // The one widget that still works on an account with no budget: the four
    // doors are there whether or not a target has been computed.
    views.setTextViewText(
      R.id.rc_quick_left,
      when {
        !snapshot.hasBudget -> ""
        snapshot.kcal.over -> "${snapshot.kcal.left} kcal over"
        else -> "${snapshot.kcal.left} kcal left"
      },
    )
    views.setOnClickPendingIntent(R.id.rc_quick_root, open(context, "open", WidgetKind.QUICK_LOG))
    views.setOnClickPendingIntent(R.id.rc_quick_snap, open(context, "camera", WidgetKind.QUICK_LOG))
    views.setOnClickPendingIntent(
      R.id.rc_quick_scan,
      open(context, "barcode", WidgetKind.QUICK_LOG),
    )
    views.setOnClickPendingIntent(
      R.id.rc_quick_search,
      open(context, "search", WidgetKind.QUICK_LOG),
    )
    views.setOnClickPendingIntent(
      R.id.rc_quick_recipe,
      open(context, "recipes", WidgetKind.QUICK_LOG),
    )
    return views
  }

  fun today(context: Context, snapshot: WidgetSnapshot?): RemoteViews {
    if (snapshot == null) return placeholder(context, WidgetKind.TODAY)
    if (!snapshot.hasBudget) return noBudget(context, WidgetKind.TODAY)

    val views = RemoteViews(context.packageName, R.layout.rc_widget_today)
    views.setImageViewBitmap(
      R.id.rc_today_ring,
      WidgetBitmaps.ring(
        context,
        sizeDp = 104,
        fraction = snapshot.kcal.fraction,
        over = snapshot.kcal.over,
        value = snapshot.kcal.left,
        caption = if (snapshot.kcal.over) "KCAL OVER" else "KCAL LEFT",
      ),
    )

    // The verdict is the app's, not this widget's. Whether a day reads as on
    // track or a bit over is decided next to the arithmetic that produced it,
    // so two surfaces about one day cannot disagree.
    views.setTextViewText(
      R.id.rc_today_verdict,
      if (snapshot.kcal.over) "A bit over" else "On track",
    )
    views.setInt(
      R.id.rc_today_verdict,
      "setBackgroundResource",
      if (snapshot.kcal.over) R.drawable.rc_widget_pill_hibiscus else R.drawable.rc_widget_pill_pandan,
    )
    views.setTextColor(
      R.id.rc_today_verdict,
      context.getColor(if (snapshot.kcal.over) R.color.rc_hibiscus else R.color.rc_pandan_ink),
    )

    views.setTextViewText(R.id.rc_today_carbs_label, "Carbs ${snapshot.macros.carbs.label}")
    views.setTextViewText(R.id.rc_today_protein_label, "Protein ${snapshot.macros.protein.label}")
    views.setTextViewText(R.id.rc_today_fat_label, "Fat ${snapshot.macros.fat.label}")
    progress(views, R.id.rc_today_carbs, snapshot.macros.carbs.fraction)
    progress(views, R.id.rc_today_protein, snapshot.macros.protein.fraction)
    progress(views, R.id.rc_today_fat, snapshot.macros.fat.fraction)

    meals(context, views, snapshot.entries)

    views.setOnClickPendingIntent(R.id.rc_today_root, open(context, "open", WidgetKind.TODAY))
    views.setOnClickPendingIntent(R.id.rc_today_snap, open(context, "camera", WidgetKind.TODAY))
    views.setOnClickPendingIntent(R.id.rc_today_search, open(context, "search", WidgetKind.TODAY))
    return views
  }

  /**
   * The four rows, or the one sentence that replaces them.
   *
   * A day before its first meal is the state this widget is in every morning,
   * so it says the ordinary thing rather than announcing an absence — the same
   * decision Today makes by drawing no empty card at all.
   */
  private fun meals(context: Context, views: RemoteViews, entries: List<WidgetSnapshot.Entry>) {
    views.setViewVisibility(R.id.rc_today_empty, if (entries.isEmpty()) View.VISIBLE else View.GONE)

    val rows = listOf(
      Triple(R.id.rc_today_meal_1, R.id.rc_today_meal_1_name, R.id.rc_today_meal_1_kcal),
      Triple(R.id.rc_today_meal_2, R.id.rc_today_meal_2_name, R.id.rc_today_meal_2_kcal),
      Triple(R.id.rc_today_meal_3, R.id.rc_today_meal_3_name, R.id.rc_today_meal_3_kcal),
      Triple(R.id.rc_today_meal_4, R.id.rc_today_meal_4_name, R.id.rc_today_meal_4_kcal),
    )

    rows.forEachIndexed { index, (row, name, kcal) ->
      val entry = entries.getOrNull(index)
      // GONE rather than INVISIBLE: an empty row left in place would hold its
      // height, and a day with one meal on it would be one line of text above
      // three lines of nothing.
      views.setViewVisibility(row, if (entry == null) View.GONE else View.VISIBLE)
      if (entry == null) return@forEachIndexed
      views.setTextViewText(name, entry.name)
      views.setTextViewText(kcal, entry.kcal)
    }
  }

  private fun progress(views: RemoteViews, id: Int, fraction: Double) {
    // Clamped here as well as in the app. A fraction is a number off a document
    // that outlives the build that wrote it.
    val value = (fraction.coerceIn(0.0, 1.0) * PROGRESS_SCALE).toInt()
    views.setProgressBar(id, PROGRESS_SCALE, value, false)
  }

  /** Signed out, never opened, or a snapshot that has aged past midnight. */
  private fun placeholder(context: Context, kind: WidgetKind) =
    message(context, kind, "RiceCal", "Open the app to bring today across.")

  /** An account whose onboarding has not computed a calorie budget yet. */
  private fun noBudget(context: Context, kind: WidgetKind) =
    message(context, kind, "No budget yet", "Answer a few questions and RiceCal works one out.")

  private fun message(context: Context, kind: WidgetKind, title: String, body: String): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.rc_widget_empty)
    views.setTextViewText(R.id.rc_empty_title, title)
    views.setTextViewText(R.id.rc_empty_body, body)
    views.setOnClickPendingIntent(R.id.rc_empty_root, open(context, "open", kind))
    return views
  }

  /**
   * A tap, as a `PendingIntent`.
   *
   * `FLAG_UPDATE_CURRENT` because the extras differ per widget and per tile:
   * without it the system hands back the first intent it ever made for this
   * request code, and every tile on the home screen would open the camera.
   * The request code is the target and the widget together, for the same
   * reason.
   */
  private fun open(context: Context, target: String, kind: WidgetKind): PendingIntent =
    PendingIntent.getActivity(
      context,
      "${kind.reported}:$target".hashCode(),
      WidgetStore.link(context, target, kind.reported),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}
