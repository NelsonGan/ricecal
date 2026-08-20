import SwiftUI
import WidgetKit

/// One entry: whatever the app last published, and when this render happened.
struct RiceCalEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
}

/**
 The timeline every RiceCal widget shares.

 It has exactly two entries and no refresh policy worth the name, because the
 app is what moves these numbers: `WidgetSync` writes the App Group and asks
 WidgetKit to reload the moment the day changes. A widget that polled on its own
 would be a second, slower answer to a question already answered.

 The second entry is midnight. Nothing recomputes at midnight — the widget
 cannot — but `WidgetSnapshot.load` refuses a snapshot from a day that has ended,
 so that entry is what turns yesterday's figures into "open RiceCal" without
 waiting for the app to be launched. Without it a phone left alone overnight
 shows the previous day's total as today's.
 */
struct RiceCalProvider: TimelineProvider {
  func placeholder(in context: Context) -> RiceCalEntry {
    RiceCalEntry(date: Date(), snapshot: .sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (RiceCalEntry) -> Void) {
    // The gallery is `isPreview`, and it is shown to somebody who has not added
    // the widget yet. Real figures there would be an empty card on a fresh
    // account, which is the worst possible advertisement for the feature.
    let snapshot = context.isPreview ? .sample : WidgetSnapshot.load()
    completion(RiceCalEntry(date: Date(), snapshot: snapshot))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<RiceCalEntry>) -> Void) {
    let now = Date()
    let snapshot = WidgetSnapshot.load()
    var entries = [RiceCalEntry(date: now, snapshot: snapshot)]

    if let midnight = Calendar.current.nextDate(
      after: now,
      matching: DateComponents(hour: 0, minute: 0, second: 5),
      matchingPolicy: .nextTime
    ) {
      // No snapshot on the second entry rather than the same one: read at
      // midnight, `load` would reject it for being yesterday's anyway, and
      // saying so here makes the intent legible.
      entries.append(RiceCalEntry(date: midnight, snapshot: nil))
    }

    // `.atEnd` rather than a fixed interval: the only two things that can change
    // what is drawn are the app publishing again (which reloads directly) and
    // the day ending (which is the last entry).
    completion(Timeline(entries: entries, policy: .atEnd))
  }
}

extension WidgetSnapshot {
  /**
   What the widget gallery shows.

   The design's own figures, so the card somebody is choosing from is the card
   in the design document. Malay dish names, for the reason the copy rules give:
   UI text is English and food names are not.
   */
  static let sample = WidgetSnapshot(
    version: WidgetSnapshot.supportedVersion,
    updatedAt: Date().timeIntervalSince1970 * 1000,
    date: WidgetSnapshot.todayKey(),
    theme: "system",
    hasBudget: true,
    kcal: .init(left: "613", eaten: "1,847", budget: "2,100", fraction: 0.88, over: false),
    macros: .init(
      carbs: .init(fraction: 0.74, label: "182g"),
      protein: .init(fraction: 0.52, label: "61g"),
      fat: .init(fraction: 0.63, label: "44g")
    ),
    water: .init(ml: 1250, goalMl: 2000, label: "1,250", goalLabel: "of 2,000 ml", fraction: 0.62),
    weight: .init(
      value: "68.4",
      unit: "kg",
      change: "\u{2212}1.8 kg",
      weeks: [0.62, 0.70, 0.56, 0.64, 0.48, 0.52, 0.44, 0.38]
    ),
    entries: [
      .init(name: "Nasi lemak ayam", kcal: "640"),
      .init(name: "Teh tarik", kcal: "135"),
      .init(name: "Char kuey teow", kcal: "742"),
      .init(name: "Kopi O kosong", kcal: "22"),
    ]
  )
}

/**
 What every widget draws when it has nothing to draw.

 Three situations reach it and they are deliberately not distinguished: signed
 out, never opened since installing, and a snapshot that has aged past midnight.
 All three have the same answer, which is to open the app, and a widget that
 tried to explain the difference would be a paragraph on a 158pt square.

 The fourth caller does override the copy: an account with no calorie budget
 yet. That one has a different answer — set a goal — and it is the same
 sentence Today shows in place of its ring.
 */
struct WidgetPlaceholder: View {
  let palette: Palette
  let kind: RiceCalWidgetKind
  var compact: Bool = false
  var title: String = "RiceCal"
  var message: String = "Open the app to bring today across."

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Spacer(minLength: 0)
      WidgetIcon(name: "wg-mark", fallback: "fork.knife", size: compact ? 26 : 30)
      Text(title)
        .font(WidgetFont.display(compact ? 16 : 18))
        .foregroundStyle(palette.heading)
      Text(message)
        .font(WidgetFont.body(compact ? 11 : 12))
        .foregroundStyle(palette.muted)
        .fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .widgetInset()
    .widgetSurface(palette)
    .widgetURL(WidgetLink.open(kind, target: "open"))
  }
}
