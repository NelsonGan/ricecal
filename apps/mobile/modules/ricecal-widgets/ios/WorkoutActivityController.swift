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
      let restEnds = restEndsAt.map { Date(timeIntervalSince1970: $0 / 1000) }
      return ActivityContent(
        state: state,
        staleDate: restEnds.flatMap { $0 > Date() ? $0 : nil }
      )
    }
  }

  private static func decode(_ json: String) -> Payload? {
    guard let data = json.data(using: .utf8),
      let payload = try? JSONDecoder().decode(Payload.self, from: data)
    else { return nil }
    if let title = payload.restTitle, let body = payload.restBody {
      RiceCalWidgetStore.setRestNotice(title: title, body: body)
    }
    return payload
  }

  static var enabled: Bool {
    ActivityAuthorizationInfo().areActivitiesEnabled
  }

  /**
   Which activity to touch is decided here, synchronously, on the thread JS
   calls from, and only the ActivityKit work that has to wait runs in a Task.
   Deciding inside the Task let an `update` that ran before its `start` had
   requested the activity request a second one for the same workout.
   */
  static func start(_ json: String) {
    guard let payload = decode(json), enabled else { return }
    let content = payload.content
    for activity in Activity<WorkoutActivityAttributes>.activities
    where activity.attributes.workoutId != payload.id {
      Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }
    if let current = Activity<WorkoutActivityAttributes>.activities.first(where: {
      $0.attributes.workoutId == payload.id
    }) {
      Task { await current.update(content) }
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

  static func update(_ json: String) {
    guard let payload = decode(json) else { return }
    guard
      let current = Activity<WorkoutActivityAttributes>.activities.first(where: {
        $0.attributes.workoutId == payload.id
      })
    else {
      // Lost (the system ends an activity after eight hours, and a user can
      // swipe one away): start it again rather than going quiet.
      start(json)
      return
    }
    let content = payload.content
    Task { await current.update(content) }
  }

  static func end() {
    Task {
      for activity in Activity<WorkoutActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
