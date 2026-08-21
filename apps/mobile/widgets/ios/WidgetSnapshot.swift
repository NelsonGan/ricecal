import Foundation

/**
 The app's `WidgetSnapshot`, as Swift reads it.

 Kept in step with `modules/ricecal-widgets/src/types.ts` by hand, which is
 exactly as fragile as it sounds — so the failure is made loud rather than
 quiet. `Codable` throws on a missing key, `decode` below turns that into
 `nil`, and every widget draws its "open RiceCal" placeholder. A field renamed
 on one side produces six blank widgets, not six widgets confidently drawing
 zero.

 Optional fields are the ones that are genuinely absent rather than the ones
 that might be: `weight` is null on an account nobody has ever weighed.
 */
struct WidgetSnapshot: Codable {
  let version: Int
  let updatedAt: Double
  let date: String
  let theme: String
  let hasBudget: Bool
  let kcal: Kcal
  let macros: Macros
  let water: Water
  let weight: Weight?
  let entries: [Entry]

  struct Kcal: Codable {
    let left: String
    let eaten: String
    let budget: String
    let fraction: Double
    let over: Bool
  }

  struct Bar: Codable {
    let fraction: Double
    /// The grams, "182g". The macro's NAME is the widget's own word for it.
    let label: String
  }

  struct Macros: Codable {
    let carbs: Bar
    let protein: Bar
    let fat: Bar
  }

  struct Water: Codable {
    let ml: Int
    let goalMl: Int
    let label: String
    let goalLabel: String
    let fraction: Double
  }

  struct Weight: Codable {
    let value: String
    let unit: String
    let change: String
    /**
     Whether the change is a gain, which is what colours the pill.

     OPTIONAL BECAUSE THE STORE OUTLIVES THE BUILD THAT WROTE IT. `Codable`
     throws on a missing key and `load` turns a throw into six blank widgets,
     so a field added after a snapshot was written has to be allowed to be
     absent — a phone that updates the app overnight renders the old document
     until the app is next opened. Missing reads as "not a gain", which is the
     colour this pill had before the field existed.
     */
    let up: Bool?
    let weeks: [Double]
  }

  struct Entry: Codable {
    let name: String
    let kcal: String
  }

  /**
   How many bars the weight chart is laid out for.

   The app sends between one and eight weekly averages, and the chart divides
   its width by THIS rather than by however many arrived — so a short history
   is narrow bars at the left rather than a few fat ones filling the card.
   Must match `WEEKS` in `features/widgets/snapshot.ts`.
   */
  static let weeks = 8

  /// The only version this build understands. See `version` in `types.ts`.
  static let supportedVersion = 1

  /**
   Read what the app published, or nothing.

   Three ways to get nothing, and they are deliberately the same answer: no
   snapshot yet (a fresh install), a snapshot this build is too old to read, and
   a snapshot describing a day that has since ended. The third is the one worth
   naming — a phone left on the bedside table would otherwise present last
   night's total as this morning's, and there is no timeline entry that can
   correct it because the widget cannot recompute anything.
   */
  static func load(today: String = WidgetSnapshot.todayKey()) -> WidgetSnapshot? {
    guard let json = RiceCalWidgetStore.snapshotJSON(),
      let data = json.data(using: .utf8),
      let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
      snapshot.version == supportedVersion,
      snapshot.date == today
    else { return nil }
    return snapshot
  }

  /// `yyyy-MM-dd` in the phone's own zone, which is the key the app writes.
  static func todayKey(_ now: Date = Date()) -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: now)
  }

  /// Whether to draw the dark palette, given what the phone is doing.
  func prefersDark(system: Bool) -> Bool {
    switch theme {
    case "dark": return true
    case "light": return false
    default: return system
    }
  }
}
