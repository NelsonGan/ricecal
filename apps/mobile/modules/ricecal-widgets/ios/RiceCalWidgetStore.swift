import Foundation
import WidgetKit

/**
 The one piece of code the app and the widget extension both run.

 They are separate processes with separate bundles, so nothing else crosses:
 the app cannot draw a widget and the widget cannot reach Supabase. What they
 share is an App Group container, and this is the whole of what goes in it — the
 snapshot the app publishes, and the taps the widget owes the app.

 IT DELIBERATELY IMPORTS NOTHING FROM EXPO. The file is compiled into the pod
 that backs the JS module *and* into the widget extension target (the config
 plugin in `plugins/withWidgets.js` adds it to both), and an extension cannot
 link ExpoModulesCore.
 */
public enum RiceCalWidgetStore {
  /**
   The App Group, read from the Info.plist rather than hardcoded.

   The bundle identifier moves with the build variant — `com.nelsongan.ricecal`
   for the store build, `.dev` on top of it for an EAS development client — and
   an App Group has to be a real entitlement on whichever one is running. So the
   config plugin derives `group.<bundleId>` at prebuild time and writes it into
   the entitlements AND into this key, on both targets. A constant here would be
   right for exactly one of the two variants and silently empty on the other.
   */
  public static let appGroup: String =
    Bundle.main.object(forInfoDictionaryKey: "RiceCalAppGroup") as? String ?? ""

  private static let snapshotKey = "snapshot"
  private static let pendingKey = "pendingActions"

  private static var defaults: UserDefaults? {
    guard !appGroup.isEmpty else { return nil }
    return UserDefaults(suiteName: appGroup)
  }

  // MARK: - The snapshot

  /// The JSON the app last published, or nil before it ever has.
  public static func snapshotJSON() -> String? {
    defaults?.string(forKey: snapshotKey)
  }

  public static func writeSnapshot(_ json: String) {
    defaults?.set(json, forKey: snapshotKey)
  }

  public static func clearSnapshot() {
    guard let defaults else { return }
    defaults.removeObject(forKey: snapshotKey)
    defaults.removeObject(forKey: pendingKey)
    // The workout's too: an exercise name in the notice words, and presses
    // for a workout that belonged to the account signing out.
    defaults.removeObject(forKey: workoutKey)
    defaults.removeObject(forKey: restNoticeKey)
  }

  // MARK: - Water added on the widget

  /**
   Record a drink the widget could not send itself, and move the figure it is
   showing so the button does something the moment it is pressed.

   The two writes are one action and are done here together rather than by the
   caller, because they have to agree: a snapshot bumped without a queued action
   is a drink the server never hears about, and a queued action without the bump
   is a button that appears to do nothing until the app is next opened.

   NOT ATOMIC ACROSS PROCESSES, and it does not need to be. The app drains the
   queue on foreground, which is a moment the widget is not being tapped, and
   the failure this would guard against — a drink pressed in the same
   millisecond as the drain — costs 250 ml on one day.
   */
  public static func addWater(ml: Int, date: String, at: Date = Date()) {
    enqueue(
      ["type": "water", "ml": ml, "date": date, "at": Int(at.timeIntervalSince1970 * 1000)],
      at: pendingKey)
    bumpWater(by: ml)
  }

  /// Read the queue and empty it. The app's half of `addWater`.
  public static func takePendingActions() -> String {
    guard let defaults else { return "[]" }
    let json = defaults.string(forKey: pendingKey) ?? "[]"
    defaults.removeObject(forKey: pendingKey)
    return json
  }

  // MARK: - Buttons pressed on the workout's Live Activity

  private static let workoutKey = "workoutActions"
  private static let restNoticeKey = "workoutRestNotice"

  /**
   Held around the read-append-write and the read-and-remove. Unlike the water
   queue, this one is drained in the moment it is filled: the press itself
   wakes the app's JS to take it, on another thread of the same process, and a
   quick double tap on +15 could otherwise apply the first press twice or lose
   the second.
   */
  private static let workoutLock = NSLock()

  /// Posted in the app's process once a Live Activity button has queued an action.
  public static let workoutActionQueued = Notification.Name("RiceCalWorkoutActionQueued")

  /**
   Queue a button pressed on the workout's Live Activity for the app to apply.

   The workout lives in the app's own storage, which the intent cannot write,
   so it leaves the action here and the app's JS applies it: at once when it
   is running, and on its next launch when it is not.
   */
  public static func queueWorkoutAction(_ action: [String: Any]) {
    guard defaults != nil else { return }
    workoutLock.lock()
    enqueue(action, at: workoutKey)
    workoutLock.unlock()
    NotificationCenter.default.post(name: workoutActionQueued, object: nil)
  }

  /// Read the workout queue and empty it. The app's half of `queueWorkoutAction`.
  public static func takeWorkoutActions() -> String {
    guard let defaults else { return "[]" }
    workoutLock.lock()
    defer { workoutLock.unlock() }
    let json = defaults.string(forKey: workoutKey) ?? "[]"
    defaults.removeObject(forKey: workoutKey)
    return json
  }

  /**
   The "rest is over" notice's words, in the user's language, written by the
   app whenever it updates the activity. A button that moves the rest has to
   move the notice with it, possibly before the app's JS has run at all, and
   the words are the app's to choose.
   */
  public static func setRestNotice(title: String, body: String, tickBody: String?) {
    var words = ["title": title, "body": body]
    if let tickBody { words["tickBody"] = tickBody }
    defaults?.set(words, forKey: restNoticeKey)
  }

  /// `tickBody` names the exercise a tick on the activity would start a rest for.
  public static func restNotice() -> (title: String, body: String, tickBody: String?)? {
    guard let stored = defaults?.dictionary(forKey: restNoticeKey) as? [String: String],
      let title = stored["title"], let body = stored["body"]
    else { return nil }
    return (title, body, stored["tickBody"])
  }

  /// Adds one entry to the end of the queue stored under `key`, written back as JSON.
  private static func enqueue(_ entry: [String: Any], at key: String) {
    guard let defaults else { return }
    var queue: [[String: Any]] = []
    if let json = defaults.string(forKey: key), let data = json.data(using: .utf8),
      let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    {
      queue = parsed
    }
    queue.append(entry)
    if let encoded = try? JSONSerialization.data(withJSONObject: queue),
      let json = String(data: encoded, encoding: .utf8)
    {
      defaults.set(json, forKey: key)
    }
  }

  /**
   Move the water figure in the stored snapshot, in place.

   Re-serialising the whole snapshot rather than keeping a separate override,
   because the widget reads exactly one document and a second source of truth
   beside it would be a third place for the tank to disagree with the app.

   `label` is rewritten here, and it is the one number the widget formats for
   itself. The rule everywhere else is that the app formats and the widget
   draws; this is the exception the interactive button forces, since the app is
   not running. Grouping is a thousands separator in the one locale this app
   ships, which is what `NumberFormatter` with `.decimal` produces.
   */
  private static func bumpWater(by ml: Int) {
    guard let defaults,
      let json = defaults.string(forKey: snapshotKey),
      let data = json.data(using: .utf8),
      var snapshot = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      var water = snapshot["water"] as? [String: Any],
      let current = water["ml"] as? Int,
      let goal = water["goalMl"] as? Int
    else { return }

    let next = max(0, current + ml)
    water["ml"] = next
    water["label"] = decimal(next)
    water["fraction"] = goal > 0 ? min(1, Double(next) / Double(goal)) : 0
    snapshot["water"] = water

    if let encoded = try? JSONSerialization.data(withJSONObject: snapshot),
      let updated = String(data: encoded, encoding: .utf8)
    {
      defaults.set(updated, forKey: snapshotKey)
    }
  }

  private static func decimal(_ value: Int) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    return formatter.string(from: NSNumber(value: value)) ?? String(value)
  }

  // MARK: - Redrawing

  public static func reloadAll() {
    WidgetCenter.shared.reloadAllTimelines()
  }
}

/**
 The six widgets, and the two names each of them has.

 `kind` is what WidgetKit keys a timeline on and what appears in the widget
 gallery's plist; `reported` is the word the app and PostHog use. They are kept
 apart on purpose — see `WidgetKind` in the module's `types.ts` — and this is the
 only place the translation happens.
 */
public enum RiceCalWidgetKind: String, CaseIterable {
  case kcal = "RiceCalKcal"
  case water = "RiceCalWater"
  case weight = "RiceCalWeight"
  case day = "RiceCalDay"
  case quickLog = "RiceCalQuickLog"
  case today = "RiceCalToday"

  public var reported: String {
    switch self {
    case .kcal: return "kcal"
    case .water: return "water"
    case .weight: return "weight"
    case .day: return "day"
    case .quickLog: return "quick_log"
    case .today: return "today"
    }
  }
}
