import ActivityKit
import Foundation

/**
 What a running workout's Live Activity carries.

 Compiled into BOTH binaries, like `RiceCalWidgetStore.swift`: the app requests
 and updates the activity, and the widget extension draws it, and ActivityKit
 pairs the two by this type's name. `plugins/withWidgets.js` copies this file
 into the extension; one source, so the two can never disagree about a field.

 The clocks are dates rather than counters. The lock screen counts the elapsed
 time and the rest itself from them (`Text(_:style: .timer)`), so the app does
 not have to wake every second to push a number nobody is looking at.
 */
public struct WorkoutActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// The workout's name, which the user can change mid-session.
    public var name: String
    /// The exercise with the next set still to do.
    public var exercise: String
    /// "2/4": the next set of that exercise, out of its sets.
    public var set: String
    /// Sets ticked so far, and sets in the workout.
    public var done: Int
    public var total: Int
    /// When the rest in progress ends, and how long it was. Nil between rests.
    public var restEndsAt: Date?
    public var restTotalS: Double?
    /// The next set, so the tick button can name it to the app.
    public var exerciseKey: String?
    public var setId: String?
    /// Whether the next set has numbers to tick: its own, or the ones it offers.
    public var canComplete: Bool?
    /// The rest the next set starts when it is ticked, for the button to show at once.
    public var restAfterS: Double?
    /// The buttons' names for VoiceOver, in the user's language.
    public var labels: ActionLabels?
  }

  /// What VoiceOver calls the activity's buttons. The extension has no strings of its own.
  public struct ActionLabels: Codable, Hashable {
    public var complete: String
    public var less: String
    public var more: String
    public var skip: String
  }

  /// The workout's own id, so a stale activity from an earlier run can be told apart.
  public var workoutId: String
  public var startedAt: Date
}
