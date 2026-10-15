import ActivityKit
import AppIntents
import Foundation

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
    RiceCalWidgetStore.queueWorkoutAction([
      "type": action,
      "workoutId": workoutId,
      "exerciseKey": exerciseKey,
      "setId": setId,
      "at": Int(at.timeIntervalSince1970 * 1000),
    ])
    await WorkoutActivityNudge.apply(action, workoutId: workoutId, at: at)
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
  static func apply(_ action: String, workoutId: String, at: Date) async {
    #if canImport(RiceCalWidgetBridge)
      guard
        let activity = Activity<WorkoutActivityAttributes>.activities.first(where: {
          $0.attributes.workoutId == workoutId
        })
      else { return }
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
        state.done = min(state.total, state.done + 1)
        state.canComplete = false
        if let rest = state.restAfterS, rest > 0 {
          state.restEndsAt = at.addingTimeInterval(rest)
          state.restTotalS = rest
        }
      default:
        return
      }
      let stale = state.restEndsAt.flatMap { $0 > at ? $0 : nil }
      await activity.update(ActivityContent(state: state, staleDate: stale))
    #endif
  }
}
