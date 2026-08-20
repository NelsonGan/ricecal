package expo.modules.ricecalwidgets

import org.json.JSONObject

/**
 * The app's `WidgetSnapshot`, as Kotlin reads it.
 *
 * Kept in step with `modules/ricecal-widgets/src/types.ts` by hand, exactly as
 * fragile as the Swift copy — so the failure is made loud in the same way.
 * `parse` returns null for anything it cannot read whole, and a null snapshot
 * draws the "open RiceCal" placeholder. A field renamed on one side produces six
 * blank widgets, not six widgets confidently drawing zero.
 *
 * `org.json` rather than a parser with a dependency behind it. This runs inside
 * a broadcast receiver with a few milliseconds to live, and the document is
 * twenty fields.
 */
data class WidgetSnapshot(
  val version: Int,
  val updatedAt: Long,
  val date: String,
  val theme: String,
  val hasBudget: Boolean,
  val kcal: Kcal,
  val macros: Macros,
  val water: Water,
  val weight: Weight?,
  val entries: List<Entry>,
) {
  data class Kcal(
    val left: String,
    val eaten: String,
    val budget: String,
    val fraction: Double,
    val over: Boolean,
  )

  /** The grams, "182g". The macro's NAME is the widget's own word for it. */
  data class Bar(val fraction: Double, val label: String)

  data class Macros(val carbs: Bar, val protein: Bar, val fat: Bar)

  data class Water(
    val ml: Int,
    val goalMl: Int,
    val label: String,
    val goalLabel: String,
    val fraction: Double,
  )

  data class Weight(
    val value: String,
    val unit: String,
    val change: String,
    val weeks: List<Double>,
  )

  data class Entry(val name: String, val kcal: String)

  companion object {
    fun parse(json: String): WidgetSnapshot? = runCatching {
      val root = JSONObject(json)
      val kcal = root.getJSONObject("kcal")
      val macros = root.getJSONObject("macros")
      val water = root.getJSONObject("water")

      WidgetSnapshot(
        version = root.getInt("version"),
        updatedAt = root.getLong("updatedAt"),
        date = root.getString("date"),
        theme = root.getString("theme"),
        hasBudget = root.getBoolean("hasBudget"),
        kcal = Kcal(
          left = kcal.getString("left"),
          eaten = kcal.getString("eaten"),
          budget = kcal.getString("budget"),
          fraction = kcal.getDouble("fraction"),
          over = kcal.getBoolean("over"),
        ),
        macros = Macros(
          carbs = bar(macros.getJSONObject("carbs")),
          protein = bar(macros.getJSONObject("protein")),
          fat = bar(macros.getJSONObject("fat")),
        ),
        water = Water(
          ml = water.getInt("ml"),
          goalMl = water.getInt("goalMl"),
          label = water.getString("label"),
          goalLabel = water.getString("goalLabel"),
          fraction = water.getDouble("fraction"),
        ),
        // Genuinely absent on an account nobody has ever weighed, which is not
        // a parse failure and must not be treated as one.
        weight = root.optJSONObject("weight")?.let {
          val weeks = it.getJSONArray("weeks")
          Weight(
            value = it.getString("value"),
            unit = it.getString("unit"),
            change = it.getString("change"),
            weeks = (0 until weeks.length()).map { index -> weeks.getDouble(index) },
          )
        },
        entries = root.getJSONArray("entries").let { array ->
          (0 until array.length()).map { index ->
            val entry = array.getJSONObject(index)
            Entry(name = entry.getString("name"), kcal = entry.getString("kcal"))
          }
        },
      )
    }.getOrNull()

    private fun bar(json: JSONObject) =
      Bar(fraction = json.getDouble("fraction"), label = json.getString("label"))
  }

  /**
   * `theme` IS DELIBERATELY NOT READ ON ANDROID.
   *
   * On iOS the widgets follow the app's own light/dark choice, because a
   * WidgetKit view resolves its colours in Swift and can simply be handed the
   * other palette. Here a widget is a `RemoteViews` tree inflated by the
   * launcher, and its colours come from `values/` and `values-night/`, which
   * the system picks by the launcher's configuration before this code runs.
   *
   * Overriding that would mean setting every colour programmatically — which
   * `RemoteViews` can only do for text, since `setBackgroundTintList` is API 31
   * and this app's floor is 26 — or shipping a second copy of every drawable
   * and swapping them by hand. Neither is worth it: an Android widget following
   * the launcher's theme is what every other Android widget does, and it is
   * what somebody who has themed their home screen expects.
   */
}
