import SwiftUI
import WidgetKit

/**
 SMALL · WEIGHT — a weekly average, so the number never jumps.

 The figure is the mean of the last seven days' readings rather than the newest
 one, which is the whole reason this widget is worth having: a bathroom scale
 moves a kilogram between Tuesday and Wednesday on water alone, and a home
 screen tile that reported that would be a mood ring.

 Eight bars behind it, oldest on the left, each scaled against the range the
 eight of them span — so the chart shows the SHAPE of the last two months rather
 than a row of nearly equal columns starting at zero. The app decides that
 scaling; see `weightBars` in `features/widgets/snapshot.ts`.
 */
struct WeightWidgetView: View {
  let entry: RiceCalEntry
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let palette = widgetPalette(for: entry.snapshot, system: colorScheme)

    if let snapshot = entry.snapshot, let weight = snapshot.weight {
      VStack(alignment: .leading, spacing: 8) {
        HStack(spacing: 4) {
          WidgetCaption(text: "WEIGHT", palette: palette)
          Spacer(minLength: 0)
          if !weight.change.isEmpty {
            // The pill states a figure, so it gives up nothing. Without the
            // priority the caption beside it wins the width and "−1.8 kg"
            // renders as "−1…", which is a pill saying nothing at all.
            // Kaya on a gain, pandan on a loss, which is what the weight list
            // on Trends does with the same figure. The direction is the app's
            // answer rather than this widget's: see `up` in `types.ts`.
            WidgetPill(
              text: weight.change,
              fill: weight.up == true ? palette.kayaSoft : palette.pandanSoft,
              ink: weight.up == true ? palette.kayaInk : palette.pandanInk,
              size: 10
            )
            .layoutPriority(1)
          }
        }

        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text(weight.value)
            .font(WidgetFont.display(32))
            .foregroundStyle(palette.heading)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .layoutPriority(1)
          Text(weight.unit)
            .font(WidgetFont.label(12))
            .foregroundStyle(palette.muted)
            .lineLimit(1)
        }

        bars(weight.weeks, palette: palette)

        Text("\(weight.weeks.count) week average")
          .font(WidgetFont.label(10))
          .foregroundStyle(palette.muted)
      }
      /**
       NO OUTER `.frame(maxHeight: .infinity)` HERE, and it is the difference
       between a chart and a stripe.

       The design gives the bars `flex: 1`, which in SwiftUI means the one
       flexible child of a stack that has been given a finite height. A frame
       proposing infinity to the VStack proposes infinity to that child too,
       the child cannot resolve it, and it collapses to nothing — leaving the
       three fixed rows centred in a card two thirds of which is empty. A
       widget already proposes its own size, so there is nothing to add.
       */
      .widgetInset()
      .widgetSurface(palette)
      .widgetURL(WidgetLink.open(.weight, target: "weight"))
    } else if entry.snapshot != nil {
      // Signed in, budget or no budget, but never weighed. Not the same as
      // having no snapshot at all, and not something a chart can stand in for.
      WidgetPlaceholder(
        palette: palette,
        kind: .weight,
        compact: true,
        title: "No weigh-ins",
        message: "Record one and the trend starts here."
      )
    } else {
      WidgetPlaceholder(palette: palette, kind: .weight, compact: true)
    }
  }

  @ViewBuilder
  private func bars(_ weeks: [Double], palette: Palette) -> some View {
    GeometryReader { geometry in
      // Divided by the FULL window rather than by however many weeks there
      // are, so an account with three weigh-ins gets three narrow bars at the
      // left rather than three fat ones filling the card. The width is what
      // says how much history there is.
      let width = (geometry.size.width - spacing * CGFloat(WidgetSnapshot.weeks - 1))
        / CGFloat(WidgetSnapshot.weeks)

      HStack(alignment: .bottom, spacing: spacing) {
        ForEach(Array(weeks.enumerated()), id: \.offset) { index, value in
          RoundedRectangle(cornerRadius: 5, style: .continuous)
            // The current week is the one in pandan. Everything behind it is
            // history, and history is a track colour rather than a second
            // accent competing with the figure above it.
            .fill(index == weeks.count - 1 ? palette.pandan : palette.track)
            // A floor of a fifth, so the lightest week is still a bar rather
            // than a line. Without it a run of stable weeks flattens into what
            // reads as missing data.
            .frame(
              width: max(width, 1),
              height: max(
                geometry.size.height * min(max(value, 0), 1),
                geometry.size.height * 0.2
              )
            )
        }
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
    }
    // ON THE GEOMETRYREADER, not on the stack inside it. A GeometryReader has no
    // ideal height of its own — asked for one it answers 10pt — so without this
    // the VStack above sizes to its three fixed rows, the chart renders as a
    // stripe, and WidgetKit centres the lot in a card two thirds empty. This is
    // what makes it the flexible child the design's `flex: 1` describes.
    .frame(maxHeight: .infinity)
  }

  /// The gap between two bars, and the figure the width above is worked out from.
  private let spacing: CGFloat = 5
}

struct WeightWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: RiceCalWidgetKind.weight.rawValue, provider: RiceCalProvider()) {
      entry in
      WeightWidgetView(entry: entry)
    }
    .configurationDisplayName("Weight")
    .description("The weekly average, and the eight weeks behind it.")
    .supportedFamilies([.systemSmall])
  }
}
