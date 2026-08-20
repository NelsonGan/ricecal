import SwiftUI

/**
 The parts more than one widget is made of.

 Everything here takes a fraction and draws it. None of it decides anything:
 what "88%" means, and whether that is a good day, was settled in the app before
 the snapshot was written. See the header of `types.ts`.
 */

/// A rounded track with a fill in it. The design's one progress shape.
struct WidgetBar: View {
  let fraction: Double
  let height: CGFloat
  let track: Color
  let fill: Color
  /// The water bar carries a line; the calorie bars do not.
  var border: Color?

  var body: some View {
    GeometryReader { geometry in
      ZStack(alignment: .leading) {
        Capsule().fill(track)
        Capsule()
          .fill(fill)
          // Clamped here as well as in the app. A fraction is a number off a
          // JSON document that outlives the build that wrote it, and a bar
          // wider than its track paints outside the card.
          .frame(width: geometry.size.width * min(max(fraction, 0), 1))
      }
      .overlay(
        border.map { Capsule().strokeBorder($0, lineWidth: 2) }
      )
    }
    .frame(height: height)
  }
}

/**
 The calorie ring.

 Drawn from the top and clockwise, which is what `rotationEffect(-90°)` on a
 trim buys: `trim(from:to:)` starts at three o'clock, and a ring that filled
 from the right would disagree with the one on Today.

 Over budget is a FULL ring in hibiscus rather than a second lap. A ring that
 wrapped would show 2,300 of 2,100 as a tenth of a circle, which reads as a day
 barely started.
 */
struct WidgetRing: View {
  let fraction: Double
  let over: Bool
  let size: CGFloat
  let thickness: CGFloat
  let palette: Palette
  let value: String
  let caption: String

  var body: some View {
    ZStack {
      Circle()
        .stroke(palette.track, lineWidth: thickness)
      Circle()
        .trim(from: 0, to: over ? 1 : min(max(fraction, 0), 1))
        .stroke(
          over ? palette.hibiscus : palette.pandan,
          style: StrokeStyle(lineWidth: thickness, lineCap: .round)
        )
        .rotationEffect(.degrees(-90))
      VStack(spacing: 1) {
        Text(value)
          .font(WidgetFont.display(size * 0.21))
          .foregroundStyle(palette.heading)
          .minimumScaleFactor(0.6)
          .lineLimit(1)
        Text(caption)
          .font(WidgetFont.label(size * 0.082))
          .kerning(0.4)
          .foregroundStyle(palette.muted)
          .lineLimit(1)
      }
      .padding(.horizontal, thickness + 2)
    }
    .frame(width: size, height: size)
  }
}

/**
 A soft tile with an icon in it: the "snap a plate or search a dish" pair.

 Not a button. A widget's tap targets are `Link`s and whole-widget URLs, so this
 is the drawing and the caller wraps it in whichever of those its family
 supports — see the note in `KcalWidget`.
 */
struct WidgetIconTile: View {
  let icon: WidgetIcon
  let fill: Color
  let line: Color
  var height: CGFloat = 38
  var radius: CGFloat = 14

  var body: some View {
    RoundedRectangle(cornerRadius: radius, style: .continuous)
      .fill(fill)
      .overlay(
        RoundedRectangle(cornerRadius: radius, style: .continuous)
          .strokeBorder(line, lineWidth: 2)
      )
      .overlay(icon)
      .frame(height: height)
  }
}

/// A tile with an icon over a word. The quick log widget's four.
struct WidgetActionTile: View {
  let icon: WidgetIcon
  let title: String
  let fill: Color
  let line: Color
  let ink: Color

  var body: some View {
    RoundedRectangle(cornerRadius: 16, style: .continuous)
      .fill(fill)
      .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .strokeBorder(line, lineWidth: 2)
      )
      .overlay(
        VStack(spacing: 6) {
          icon
          Text(title)
            .font(WidgetFont.label(11))
            .foregroundStyle(ink)
        }
      )
  }
}

/// One macro: its name, its grams when there is room, and how full it is.
struct WidgetMacroBar: View {
  let name: String
  let bar: WidgetSnapshot.Bar
  let colour: Color
  let palette: Palette
  /// The medium widget has room for the name alone; the large adds the grams.
  var showGrams: Bool = false

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(showGrams ? "\(name) \(bar.label)" : name)
        .font(WidgetFont.label(10))
        .foregroundStyle(palette.muted)
        .lineLimit(1)
      WidgetBar(fraction: bar.fraction, height: 7, track: palette.track, fill: colour)
    }
  }
}

/// The pill in a corner: "On track", "−1.8 kg".
struct WidgetPill: View {
  let text: String
  let fill: Color
  let ink: Color
  var size: CGFloat = 11

  var body: some View {
    Text(text)
      .font(WidgetFont.label(size))
      .foregroundStyle(ink)
      .padding(.horizontal, 9)
      .padding(.vertical, 4)
      .background(Capsule().fill(fill))
  }
}

/// A screaming-quiet section label: "KCAL LEFT", "WATER", "WEIGHT".
struct WidgetCaption: View {
  let text: String
  let palette: Palette
  var size: CGFloat = 11

  var body: some View {
    Text(text)
      .font(WidgetFont.label(size))
      .kerning(0.8)
      .foregroundStyle(palette.faint)
      .lineLimit(1)
  }
}
