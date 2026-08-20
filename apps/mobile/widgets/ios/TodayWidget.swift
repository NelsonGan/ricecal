import SwiftUI
import WidgetKit

/**
 LARGE · TODAY — the Today screen without chrome or nav.

 The one widget with the diary itself on it: the ring, the macros with their
 grams, and the meals in the order the day happened. Four rows, which is what
 the frame holds at a size the names are still readable at — a fifth would mean
 shrinking type below the design system's floor, and the rule there is to remove
 a card rather than shrink the type.

 The verdict pill is the app's, not this widget's. Whether a day reads as on
 track or a bit over is decided next to the arithmetic that produced it, for the
 same reason `day_marks` leaves it to the client: two surfaces about one day must
 not disagree.
 */
struct TodayWidgetView: View {
  let entry: RiceCalEntry
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let palette = widgetPalette(for: entry.snapshot, system: colorScheme)

    if let snapshot = entry.snapshot, snapshot.hasBudget {
      VStack(alignment: .leading, spacing: 13) {
        HStack {
          Text("Today")
            .font(WidgetFont.display(17))
            .foregroundStyle(palette.heading)
          Spacer(minLength: 6)
          WidgetPill(
            text: snapshot.kcal.over ? "A bit over" : "On track",
            fill: snapshot.kcal.over ? palette.hibiscusSoft : palette.pandanSoft,
            ink: snapshot.kcal.over ? palette.hibiscus : palette.pandanInk
          )
        }

        HStack(spacing: 14) {
          WidgetRing(
            fraction: snapshot.kcal.fraction,
            over: snapshot.kcal.over,
            size: 104,
            thickness: 11,
            palette: palette,
            value: snapshot.kcal.left,
            caption: snapshot.kcal.over ? "KCAL OVER" : "KCAL LEFT"
          )

          VStack(alignment: .leading, spacing: 8) {
            WidgetMacroBar(
              name: "Carbs", bar: snapshot.macros.carbs, colour: palette.kaya, palette: palette,
              showGrams: true)
            WidgetMacroBar(
              name: "Protein", bar: snapshot.macros.protein, colour: palette.hibiscus,
              palette: palette, showGrams: true)
            WidgetMacroBar(
              name: "Fat", bar: snapshot.macros.fat, colour: palette.teh, palette: palette,
              showGrams: true)
          }
        }

        Rectangle().fill(palette.track).frame(height: 2)

        meals(snapshot.entries, palette: palette)

        Spacer(minLength: 0)

        HStack(spacing: 10) {
          Link(destination: WidgetLink.open(.today, target: "camera")) {
            action("Snap", icon: .camera(19), palette: palette)
          }
          Link(destination: WidgetLink.open(.today, target: "search")) {
            action("Search", icon: .search(19), palette: palette)
          }
        }
      }
      .widgetInset()
      .widgetSurface(palette)
    } else if let snapshot = entry.snapshot, !snapshot.hasBudget {
      WidgetPlaceholder(
        palette: palette,
        kind: .today,
        title: "No budget yet",
        message: "Answer a few questions and RiceCal works one out."
      )
    } else {
      WidgetPlaceholder(palette: palette, kind: .today)
    }
  }

  @ViewBuilder
  private func meals(_ entries: [WidgetSnapshot.Entry], palette: Palette) -> some View {
    if entries.isEmpty {
      // A day before its first meal is the state this widget is in every
      // morning, so it says the ordinary thing rather than announcing an
      // absence. The same decision Today makes by drawing no empty card at all.
      Text("Nothing logged yet.")
        .font(WidgetFont.body(12))
        .foregroundStyle(palette.muted)
    } else {
      VStack(spacing: 9) {
        ForEach(Array(entries.enumerated()), id: \.offset) { _, meal in
          HStack(spacing: 10) {
            Text(meal.name)
              .font(WidgetFont.label(12))
              .foregroundStyle(palette.ink)
              .lineLimit(1)
              .truncationMode(.tail)
            Spacer(minLength: 4)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
              Text(meal.kcal)
                .font(WidgetFont.display(13))
                .foregroundStyle(palette.ink)
              Text("kcal")
                .font(WidgetFont.label(10))
                .foregroundStyle(palette.muted)
            }
          }
        }
      }
    }
  }

  private func action(_ title: String, icon: WidgetIcon, palette: Palette) -> some View {
    RoundedRectangle(cornerRadius: 16, style: .continuous)
      .fill(palette.pandanSoft)
      .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .strokeBorder(palette.pandanSoftLine, lineWidth: 2)
      )
      .overlay(
        HStack(spacing: 8) {
          icon
          Text(title)
            .font(WidgetFont.display(14))
            .foregroundStyle(palette.ink)
        }
      )
      .frame(height: 43)
  }
}

struct TodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: RiceCalWidgetKind.today.rawValue, provider: RiceCalProvider()) {
      entry in
      TodayWidgetView(entry: entry)
    }
    .configurationDisplayName("The whole day")
    .description("The ring, the macros and what you have eaten so far.")
    .supportedFamilies([.systemLarge])
  }
}
