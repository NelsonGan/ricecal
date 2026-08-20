import SwiftUI
import WidgetKit

/**
 SMALL · KCAL — one number, one bar, and two ways in.

 THE TWO TILES ARE DRAWN BUT NOT SEPARATELY TAPPABLE, and that is a platform
 rule rather than an omission: a `systemSmall` widget has exactly one tap
 target, which is `widgetURL`. `Link` is ignored there.

 So the whole card opens the log sheet on the camera, which is what the log
 button itself does and what somebody reaching for this widget almost always
 means. The search tile is a signpost to the panel one tab away rather than a
 dead control, and the medium widget beside it is where the two really are two.
 */
struct KcalWidgetView: View {
  let entry: RiceCalEntry
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let palette = widgetPalette(for: entry.snapshot, system: colorScheme)

    if let snapshot = entry.snapshot, snapshot.hasBudget {
      VStack(alignment: .leading, spacing: 0) {
        WidgetCaption(text: snapshot.kcal.over ? "KCAL OVER" : "KCAL LEFT", palette: palette)

        Spacer(minLength: 6)

        /**
         The figure comes first and the goal gives way.
         
         `layoutPriority` and the scale factors are both needed and they answer
         different halves of the same problem: a four-figure budget with nothing
         eaten yet puts "1,880 of 1,880" on a 158pt square, which is wider than
         the square. Without the priority SwiftUI shares the shortfall evenly and
         truncates the headline number to "1,8…"; without the scale factors the
         priority merely moves the truncation onto the goal.
         */
        HStack(alignment: .firstTextBaseline, spacing: 5) {
          Text(snapshot.kcal.left)
            .font(WidgetFont.display(34))
            .foregroundStyle(palette.heading)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .layoutPriority(1)
          Text("of \(snapshot.kcal.budget)")
            .font(WidgetFont.label(11))
            .foregroundStyle(palette.muted)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }

        Spacer(minLength: 6)

        WidgetBar(
          fraction: snapshot.kcal.fraction,
          height: 12,
          track: palette.track,
          fill: snapshot.kcal.over ? palette.hibiscus : palette.pandan
        )

        Spacer(minLength: 8)

        HStack(spacing: 8) {
          WidgetIconTile(
            icon: .camera(20),
            fill: palette.pandanSoft,
            line: palette.pandanSoftLine
          )
          WidgetIconTile(
            icon: .search(20),
            fill: palette.pandanSoft,
            line: palette.pandanSoftLine
          )
        }
      }
      .widgetInset()
      .widgetSurface(palette)
      .widgetURL(WidgetLink.open(.kcal, target: "camera"))
    } else if let snapshot = entry.snapshot, !snapshot.hasBudget {
      WidgetPlaceholder(
        palette: palette,
        kind: .kcal,
        compact: true,
        title: "No budget yet",
        message: "Answer a few questions and RiceCal works one out."
      )
    } else {
      WidgetPlaceholder(palette: palette, kind: .kcal, compact: true)
    }
  }
}

struct KcalWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: RiceCalWidgetKind.kcal.rawValue, provider: RiceCalProvider()) { entry in
      KcalWidgetView(entry: entry)
    }
    .configurationDisplayName("Calories left")
    .description("What is left of today, and the quickest way to log the next thing.")
    .supportedFamilies([.systemSmall])
  }
}
