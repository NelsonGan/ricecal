package expo.modules.ricecalwidgets

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface

/**
 * The two things a `RemoteViews` tree cannot draw, drawn into bitmaps.
 *
 * Everything else in these widgets is a view with a drawable behind it, which
 * is cheaper and themes itself. These two are not:
 *
 * - **The ring.** There is no remotable sweep and no arc drawable that takes an
 *   angle, so a ring built out of views would be one drawable per degree.
 * - **The weight bars.** Their heights are the data, and `RemoteViews` cannot
 *   set a child's height below API 31 — laid out as views they would all be the
 *   same size, which is a chart that says nothing.
 *
 * Both read their colours through `context.getColor`, so `values-night/` still
 * decides them: the bitmap is redrawn on every update, and an update is what a
 * configuration change produces.
 */
object WidgetBitmaps {
  /** How many bars the weight chart is laid out for. See `bars`. */
  private const val WEEKS = 8


  /**
   * The calorie ring, filled from the top and clockwise.
   *
   * `-90` is what starts it at twelve o'clock: `drawArc` begins at three, and a
   * ring that filled from the right would disagree with the one on Today.
   *
   * Over budget is a FULL ring in hibiscus rather than a second lap. A ring that
   * wrapped would show 2,300 of 2,100 as a tenth of a circle, which reads as a
   * day barely started.
   */
  fun ring(
    context: Context,
    sizeDp: Int,
    fraction: Double,
    over: Boolean,
    value: String,
    caption: String,
  ): Bitmap {
    val density = context.resources.displayMetrics.density
    val size = (sizeDp * density).toInt().coerceAtLeast(1)
    val thickness = 11f * density

    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)

    val inset = thickness / 2f
    val bounds = RectF(inset, inset, size - inset, size - inset)

    val track = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = thickness
      color = context.getColor(R.color.rc_track)
    }
    canvas.drawArc(bounds, 0f, 360f, false, track)

    val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = thickness
      strokeCap = Paint.Cap.ROUND
      color = context.getColor(if (over) R.color.rc_hibiscus else R.color.rc_pandan)
    }
    val sweep = if (over) 360f else (fraction.coerceIn(0.0, 1.0) * 360.0).toFloat()
    if (sweep > 0f) canvas.drawArc(bounds, -90f, sweep, false, fill)

    val figure = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      typeface = font(context, R.font.rc_baloo2_extrabold)
      textAlign = Paint.Align.CENTER
      textSize = size * 0.21f
      color = context.getColor(R.color.rc_heading)
    }
    val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      typeface = font(context, R.font.rc_nunito_extrabold)
      textAlign = Paint.Align.CENTER
      textSize = size * 0.082f
      letterSpacing = 0.06f
      color = context.getColor(R.color.rc_muted)
    }

    // The pair is centred as a block rather than each line on its own: the
    // figure is three times the caption's size, so centring them separately
    // leaves the caption reading as though it belonged to the ring below it.
    val centre = size / 2f
    canvas.drawText(value, centre, centre + figure.textSize * 0.18f, figure)
    canvas.drawText(caption, centre, centre + figure.textSize * 0.18f + label.textSize * 1.7f, label)

    return bitmap
  }

  /**
   * The eight weekly averages, oldest on the left.
   *
   * The last bar is the current week and is the one in pandan; everything
   * behind it is history, and history is a track colour rather than a second
   * accent competing with the figure above it.
   *
   * A floor of a fifth on every bar, so the lightest week is still a bar rather
   * than a line — without it a run of stable weeks flattens into what reads as
   * missing data.
   */
  fun bars(context: Context, widthDp: Int, heightDp: Int, values: List<Double>): Bitmap {
    val density = context.resources.displayMetrics.density
    val width = (widthDp * density).toInt().coerceAtLeast(1)
    val height = (heightDp * density).toInt().coerceAtLeast(1)

    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    if (values.isEmpty()) return bitmap

    val canvas = Canvas(bitmap)
    val gap = 5f * density
    // A THIRD OF THE BAR'S WIDTH, capped at the design's 5dp. Eight bars on a
    // 110dp card are about 10dp each, and a flat 5dp radius on a 10dp bar draws
    // a pill: the corners meet in the middle and the column stops reading as a
    // column. The design's 5px is against a bar three times this wide.
    val radius: Float
    // Divided by the FULL window rather than by however many weeks arrived, so
    // an account with three weigh-ins gets three narrow bars at the left rather
    // than three fat ones filling the card. The width is what says how much
    // history there is. Must match `WEEKS` in `features/widgets/snapshot.ts`.
    val barWidth = (width - gap * (WEEKS - 1)) / WEEKS
    radius = minOf(barWidth / 3f, 5f * density)

    val past = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = context.getColor(R.color.rc_track) }
    val now = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = context.getColor(R.color.rc_pandan) }

    values.forEachIndexed { index, value ->
      val bar = (height * value.coerceIn(0.0, 1.0)).toFloat().coerceAtLeast(height * 0.2f)
      val left = index * (barWidth + gap)
      canvas.drawRoundRect(
        RectF(left, height - bar, left + barWidth, height.toFloat()),
        radius,
        radius,
        if (index == values.size - 1) now else past,
      )
    }

    return bitmap
  }

  /**
   * A bundled font, or the platform's own.
   *
   * `Resources.getFont` is API 26, which is this app's floor, so there is no
   * compat path to take. The fallback is for a build where the Gradle copy
   * task did not run: a widget in the wrong typeface is a bug worth seeing,
   * and a crash on a home screen is not.
   */
  private fun font(context: Context, id: Int): Typeface =
    runCatching { context.resources.getFont(id) }.getOrDefault(Typeface.DEFAULT_BOLD)
}
