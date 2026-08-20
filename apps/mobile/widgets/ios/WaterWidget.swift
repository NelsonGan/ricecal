import SwiftUI
import WidgetKit

/**
 SMALL · WATER — the one widget that logs something rather than pointing at it.

 Two presets, 250 ml and 500 ml, which are a kopitiam tumbler and a bottle. Any
 other amount goes in the app, and that is deliberate rather than a limitation:
 the sheet already offers the full range, and a widget with a stepper on it
 would be a worse version of a control that exists.

 THE PRESETS ARE ONLY BUTTONS FROM iOS 17. Below that a `systemSmall` widget has
 no interactive controls and no per-region links at all, so the card is drawn the
 same way and the whole of it opens the app on Today, where the tank is.
 */
struct WaterWidgetView: View {
  let entry: RiceCalEntry
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let palette = widgetPalette(for: entry.snapshot, system: colorScheme)

    if let snapshot = entry.snapshot {
      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          // The caption names the card, so it is the half that keeps its width.
          // Left to share it evenly the two rendered as "WAT…  of 2,000 ml".
          WidgetCaption(text: "WATER", palette: palette)
            .layoutPriority(1)
          Spacer(minLength: 0)
          // Shrinks rather than truncates. "of 2,000 ml" beside "WATER" is
          // wider than a 158pt square at 10pt, and "of 2,000…" is the one
          // ending that makes the goal unreadable.
          Text(snapshot.water.goalLabel)
            .font(WidgetFont.label(10))
            .foregroundStyle(palette.muted)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }

        Spacer(minLength: 6)

        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text(snapshot.water.label)
            .font(WidgetFont.display(30))
            .foregroundStyle(palette.heading)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .layoutPriority(1)
          Text("ml")
            .font(WidgetFont.label(12))
            .foregroundStyle(palette.muted)
            .lineLimit(1)
        }

        Spacer(minLength: 6)

        WidgetBar(
          fraction: snapshot.water.fraction,
          height: 14,
          track: palette.waterSoft,
          fill: palette.water,
          border: palette.waterSoftLine
        )

        Spacer(minLength: 8)

        presets(palette)
      }
      .widgetInset()
      .widgetSurface(palette)
      // Only the fallback path claims the whole card. With buttons on it, a
      // widget URL would fire on every miss between them and open the app on a
      // tap the user meant as "+250".
      .widgetURL(interactive ? nil : WidgetLink.open(.water, target: "water"))
    } else {
      WidgetPlaceholder(palette: palette, kind: .water, compact: true)
    }
  }

  private var interactive: Bool {
    if #available(iOS 17.0, *) { return true }
    return false
  }

  @ViewBuilder
  private func presets(_ palette: Palette) -> some View {
    HStack(spacing: 6) {
      preset(250, palette: palette)
      preset(500, palette: palette)
    }
    .frame(height: 34)
  }

  @ViewBuilder
  private func preset(_ ml: Int, palette: Palette) -> some View {
    if #available(iOS 17.0, *) {
      Button(intent: AddWaterIntent(millilitres: ml)) {
        presetLabel(ml, palette: palette)
      }
      // The system's own button chrome would put a grey capsule under a
      // control the design already draws. `.plain` leaves the label alone.
      .buttonStyle(.plain)
    } else {
      presetLabel(ml, palette: palette)
    }
  }

  private func presetLabel(_ ml: Int, palette: Palette) -> some View {
    ZStack {
      // The slab: a second rectangle rather than a blur, six points down. The
      // design system's squishy button, as far as a widget can take it — there
      // is no press state to animate, since the system owns the touch.
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(palette.waterSlab)
        .offset(y: 4)
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(palette.water)
      Text("+\(ml)")
        .font(WidgetFont.display(13))
        .foregroundStyle(palette.onWater)
    }
    .padding(.bottom, 4)
  }
}

struct WaterWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: RiceCalWidgetKind.water.rawValue, provider: RiceCalProvider()) {
      entry in
      WaterWidgetView(entry: entry)
    }
    .configurationDisplayName("Water")
    .description("A drink logged without opening the app.")
    .supportedFamilies([.systemSmall])
  }
}
