import SwiftUI
import WidgetKit

/**
 MEDIUM · DAY — the ring, the macros, and two ways in that really are two.

 The medium family supports per-region `Link`s, so unlike the small calorie
 widget the camera and the search tiles here go to different panels of the log
 sheet. That difference is the reason both widgets exist rather than one.
 */
struct DayWidgetView: View {
  let entry: RiceCalEntry
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let palette = widgetPalette(for: entry.snapshot, system: colorScheme)

    if let snapshot = entry.snapshot, snapshot.hasBudget {
      HStack(spacing: 16) {
        WidgetRing(
          fraction: snapshot.kcal.fraction,
          over: snapshot.kcal.over,
          size: 110,
          thickness: 11,
          palette: palette,
          value: snapshot.kcal.left,
          caption: snapshot.kcal.over ? "KCAL OVER" : "KCAL LEFT"
        )

        VStack(alignment: .leading, spacing: 11) {
          Text("\(snapshot.kcal.eaten) of \(snapshot.kcal.budget) kcal")
            .font(WidgetFont.display(15))
            .foregroundStyle(palette.heading)
            .lineLimit(1)
            .minimumScaleFactor(0.7)

          HStack(spacing: 8) {
            WidgetMacroBar(
              name: "Carbs", bar: snapshot.macros.carbs, colour: palette.kaya, palette: palette)
            WidgetMacroBar(
              name: "Protein", bar: snapshot.macros.protein, colour: palette.hibiscus,
              palette: palette)
            WidgetMacroBar(
              name: "Fat", bar: snapshot.macros.fat, colour: palette.teh, palette: palette)
          }

          HStack(spacing: 8) {
            Link(destination: WidgetLink.open(.day, target: "camera")) {
              WidgetIconTile(
                icon: .camera(20), fill: palette.pandanSoft, line: palette.pandanSoftLine)
            }
            Link(destination: WidgetLink.open(.day, target: "search")) {
              WidgetIconTile(
                icon: .search(20), fill: palette.pandanSoft, line: palette.pandanSoftLine)
            }
          }
        }
      }
      .widgetInset()
      .widgetSurface(palette)
    } else if let snapshot = entry.snapshot, !snapshot.hasBudget {
      WidgetPlaceholder(
        palette: palette,
        kind: .day,
        title: "No budget yet",
        message: "Answer a few questions and RiceCal works one out."
      )
    } else {
      WidgetPlaceholder(palette: palette, kind: .day)
    }
  }
}

struct DayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: RiceCalWidgetKind.day.rawValue, provider: RiceCalProvider()) { entry in
      DayWidgetView(entry: entry)
    }
    .configurationDisplayName("Today")
    .description("The ring and the macros, with a way straight into logging.")
    .supportedFamilies([.systemMedium])
  }
}
