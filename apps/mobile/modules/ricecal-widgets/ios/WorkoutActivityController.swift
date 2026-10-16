import ActivityKit
import Foundation

/**
 The app's end of the workout Live Activity: start it, keep it current, end it.

 Called from JS on every change to the running workout. Each call is a no-op
 where Live Activities cannot run (switched off in Settings, or a device that
 has none), because the workout itself works the same either way.

 One activity at a time. A start for a different workout than the one on the
 lock screen ends the old one first, which is what clears an activity left
 behind by a workout that was discarded while the app was not running.
 */
enum WorkoutActivityController {
  private struct Payload: Decodable {
    let id: String
    let name: String
    let startedAt: Double
    let exercise: String
    let set: String
    let done: Int
    let total: Int
    let restEndsAt: Double?
    let restTotalS: Double?
    let exerciseKey: String?
    let setId: String?
    let canComplete: Bool?
    let restAfterS: Double?
    /// The "rest is over" notice for the next set, kept for the buttons. See `RiceCalWidgetStore.setRestNotice`.
    let restTitle: String?
    let restBody: String?
    /// The same notice for a rest the activity's tick would start.
    let tickRestBody: String?
    /// Screen-reader names for the buttons, which the extension cannot translate itself.
    let labels: WorkoutActivityAttributes.ActionLabels?

    var state: WorkoutActivityAttributes.ContentState {
      WorkoutActivityAttributes.ContentState(
        name: name,
        exercise: exercise,
        set: set,
        done: done,
        total: total,
        restEndsAt: restEndsAt.map { Date(timeIntervalSince1970: $0 / 1000) },
        restTotalS: restTotalS,
        exerciseKey: exerciseKey,
        setId: setId,
        canComplete: canComplete,
        restAfterS: restAfterS,
        labels: labels
      )
    }

    /**
     A running rest's end, as the content's stale date. The view hides the rest
     once its end has passed, but a view is only drawn again when something
     changes, and with the phone locked the app cannot send that change. The
     stale date is the system's own redraw at that moment, so the bar does not
     sit at 0:00 until the next set is ticked.
     */
    var content: ActivityContent<WorkoutActivityAttributes.ContentState> {
      let state = self.state
      return ActivityContent(
        state: state, staleDate: state.restEndsAt.flatMap { $0 > Date() ? $0 : nil })
    }
  }

  private static func decode(_ json: String) -> Payload? {
    guard let data = json.data(using: .utf8),
      let payload = try? JSONDecoder().decode(Payload.self, from: data)
    else { return nil }
    if let title = payload.restTitle, let body = payload.restBody {
      RiceCalWidgetStore.setRestNotice(title: title, body: body, tickBody: payload.tickRestBody)
    }
    return payload
  }

  /**
   ActivityKit's calls run one after another, in the order JS made them. Each
   was its own `Task`, and two updates a few milliseconds apart (a launch's
   first write and the drain of a lock-screen press) could land in either
   order and leave the older state on the lock screen.
   */
  private static let lock = NSLock()
  private static var tail: Task<Void, Never>?

  private static func serially(_ work: @escaping () async -> Void) {
    lock.lock()
    defer { lock.unlock() }
    let previous = tail
    tail = Task {
      await previous?.value
      await work()
    }
  }

  /**
   The activity showing this workout, if it is still alive. iOS keeps an
   activity it has ended (at eight hours, or swiped away) in the list for a
   while, and updating that one changed nothing, so it is ended for good and
   the caller starts a fresh one.
   */
  private static func live(for workoutId: String) -> Activity<WorkoutActivityAttributes>? {
    let matches = Activity<WorkoutActivityAttributes>.activities.filter {
      $0.attributes.workoutId == workoutId
    }
    if let alive = matches.first(where: { $0.activityState == .active || $0.activityState == .stale }) {
      return alive
    }
    for dead in matches {
      serially { await dead.end(nil, dismissalPolicy: .immediate) }
    }
    return nil
  }

  /**
   Starts the workout's activity, or updates it when it is already showing. One
   that was lost (the system ends an activity after eight hours, and a user can
   swipe one away) is started again rather than going quiet.

   Which activity to touch is decided here, synchronously, on the thread JS
   calls from, and only the ActivityKit work that has to wait runs in a Task.
   Deciding inside the Task let an update that ran before its start had
   requested the activity request a second one for the same workout.
   */
  static func start(_ json: String) {
    guard let payload = decode(json), ActivityAuthorizationInfo().areActivitiesEnabled else {
      return
    }
    let content = payload.content
    for activity in Activity<WorkoutActivityAttributes>.activities
    where activity.attributes.workoutId != payload.id {
      serially { await activity.end(nil, dismissalPolicy: .immediate) }
    }
    if let current = live(for: payload.id) {
      serially { await current.update(content) }
      return
    }
    do {
      _ = try Activity.request(
        attributes: WorkoutActivityAttributes(
          workoutId: payload.id,
          startedAt: Date(timeIntervalSince1970: payload.startedAt / 1000)
        ),
        content: content,
        pushType: nil
      )
    } catch {
      NSLog("[RiceCalWidgets] could not start the workout activity: \(error)")
    }
  }

  /// Taken now rather than inside the task, so a start that follows cannot be ended by it.
  static func end() {
    for activity in Activity<WorkoutActivityAttributes>.activities {
      serially { await activity.end(nil, dismissalPolicy: .immediate) }
    }
  }
}
