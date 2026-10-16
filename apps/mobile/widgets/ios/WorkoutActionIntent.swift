import ActivityKit
import AppIntents
import Foundation
import UserNotifications

// In the app this file sits beside the pod that owns the store and the
// attributes; in the extension both are compiled in alongside it. `internal`
// because Expo's generated module provider imports the pod that way in the same
// target, and Swift refuses a second import of it at another access level.
#if canImport(RiceCalWidgetBridge)
  internal import RiceCalWidgetBridge
#endif

/**
 The buttons on a running workout's Live Activity: skip the rest, take fifteen
 seconds off it or add fifteen, and tick the next set.

 A `LiveActivityIntent`, so iOS runs `perform` in the APP's process, launching
 it in the background if it has to, rather than in the widget extension. Only
 the app may update its activities. That is also why this one file is compiled
 into both targets (`plugins/withWidgets.js` puts it in each): the extension
 needs the type to draw `Button(intent:)`, and the app is where it runs.

 Two halves, as with the water widget's buttons. The action is queued for the
 app's JS, which owns the workout and applies it to the document, and the
 activity is moved on the spot so the button answers whether JS is running or
 not. When JS next writes the activity it writes the truth over this guess.
 */
@available(iOS 17.0, *)
struct WorkoutActionIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Workout"
  static var isDiscoverable: Bool = false

  /// "skipRest", "restMinus", "restPlus" or "completeSet".
  @Parameter(title: "Action")
  var action: String

  @Parameter(title: "Workout")
  var workoutId: String

  /// The set the tick is for, as the activity named it when it was drawn.
  @Parameter(title: "Exercise")
  var exerciseKey: String

  @Parameter(title: "Set")
  var setId: String

  init() {}

  init(action: String, workoutId: String, exerciseKey: String = "", setId: String = "") {
    self.action = action
    self.workoutId = workoutId
    self.exerciseKey = exerciseKey
    self.setId = setId
  }

  func perform() async throws -> some IntentResult {
    let at = Date()
    // The guess first, then the queue: queueing wakes the app's JS, which
    // writes the truth, and a guess landing after it would draw over it.
    await WorkoutActivityNudge.apply(
      action, workoutId: workoutId, exerciseKey: exerciseKey, setId: setId, at: at)
    RiceCalWidgetStore.queueWorkoutAction([
      "type": action,
      "workoutId": workoutId,
      "exerciseKey": exerciseKey,
      "setId": setId,
      "at": Int(at.timeIntervalSince1970 * 1000),
    ])
    return .result()
  }
}

/**
 The activity's half: what the button does to the lock screen at once. Only
 the rest and the count; which set comes next is the app's to say, so the tick
 hides itself until the app has said it.
 */
@available(iOS 17.0, *)
enum WorkoutActivityNudge {
  static func apply(
    _ action: String, workoutId: String, exerciseKey: String, setId: String, at: Date
  ) async {
    #if canImport(RiceCalWidgetBridge)
      // A live one: an ended activity can still be listed, and updating it is a no-op.
      guard
        let activity = Activity<WorkoutActivityAttributes>.activities.first(where: {
          $0.attributes.workoutId == workoutId
            && ($0.activityState == .active || $0.activityState == .stale)
        })
      else { return }
      var startedRest = false
      var state = activity.content.state
      switch action {
      case "skipRest":
        state.restEndsAt = nil
        state.restTotalS = nil
      case "restMinus", "restPlus":
        guard let ends = state.restEndsAt else { return }
        let by: TimeInterval = action == "restPlus" ? 15 : -15
        let next = ends.addingTimeInterval(by)
        if next <= at {
          state.restEndsAt = nil
          state.restTotalS = nil
        } else {
          state.restEndsAt = next
          state.restTotalS = max(1, (state.restTotalS ?? 0) + by)
        }
      case "completeSet":
        // Only the set the tick was drawn for, and only once: a second tap
        // before the redraw counted the set twice and restarted the rest, and
        // the app, which ignores a set already done, never wrote it back.
        guard state.canComplete == true, state.setId == setId, state.exerciseKey == exerciseKey
        else { return }
        state.done = min(state.total, state.done + 1)
        state.canComplete = false
        if let rest = state.restAfterS, rest > 0 {
          state.restEndsAt = at.addingTimeInterval(rest)
          state.restTotalS = rest
          startedRest = true
        }
      default:
        return
      }
      let stale = state.restEndsAt.flatMap { $0 > at ? $0 : nil }
      await activity.update(ActivityContent(state: state, staleDate: stale))
      // The tick's wording only for a rest the tick started: one already
      // running after it is about the exercise that started it.
      await RestNotice.reschedule(endsAt: stale, at: at, forTick: startedRest)
    #endif
  }
}

/**
 The "rest is over" notification, moved with the rest. The app books it for
 every rest, but a button pressed while the app is not running would otherwise
 leave it where it was: firing after a skipped rest, fifteen seconds early
 after +15, or not at all for the rest a tick starts. Same identifier as the
 app's (`WORKOUT_NOTICE.rest`), so either side booking it replaces the other.
 */
@available(iOS 17.0, *)
enum RestNotice {
  static let identifier = "workout-rest"

  static func reschedule(endsAt: Date?, at: Date, forTick: Bool = false) async {
    #if canImport(RiceCalWidgetBridge)
      let center = UNUserNotificationCenter.current()
      center.removePendingNotificationRequests(withIdentifiers: [identifier])
      guard let endsAt, let words = RiceCalWidgetStore.restNotice() else { return }
      // A tick starts the rest after the set it ticked, which names that
      // exercise; a running rest belongs to the one before it.
      let body = forTick ? (words.tickBody ?? words.body) : words.body
      let seconds = endsAt.timeIntervalSince(at)
      guard seconds >= 1 else { return }
      let content = UNMutableNotificationContent()
      content.title = words.title
      content.body = body
      content.sound = .default
      // A local notification's `data` is its whole userInfo to
      // expo-notifications (only a remote push nests it under "body"). Nested,
      // JS read no kind: the reminder sync cancelled it as a stray, and a tap
      // on it opened nothing.
      content.userInfo = ["kind": "rest"]
      let request = UNNotificationRequest(
        identifier: identifier,
        content: content,
        trigger: UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
      )
      try? await center.add(request)
    #endif
  }
}
