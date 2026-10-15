import ActivityKit
import SwiftUI
import WidgetKit

/**
 A running workout on the lock screen and in the Dynamic Island.

 The figure people glance at between sets is the rest, so whenever one is
 counting down it takes the most room: the trailing edge of the island and a
 bar across the lock screen card. Otherwise the elapsed time does. Both are
 counted by the system from dates in the content state (`Text(_:style:)` and
 `Text(timerInterval:)`), so the app never has to wake up to move them.

 Tapping it opens the logger, through `workout/resume`, which
 `app/+native-intent.tsx` turns into the logger with the app running and into
 the Workouts tab (which then opens the logger) on a cold launch. Not through
 `ricecal://widget/...`, which is how a home-screen widget tap is counted,
 because this is the workout itself rather than a widget somebody placed.
 */
struct WorkoutLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
      WorkoutLockScreen(context: context)
        .widgetURL(WorkoutLink.logger)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 8) {
            WorkoutIcon(size: 30)
            ElapsedClock(startedAt: context.attributes.startedAt)
              .font(WidgetFont.display(20))
              .foregroundStyle(Palette.dark.pandan)
          }
          .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          Text(context.state.name)
            .font(WidgetFont.label(15))
            .lineLimit(1)
        }
        DynamicIslandExpandedRegion(.trailing) {
          VStack(alignment: .trailing, spacing: 0) {
            Text("\(context.state.done)/\(context.state.total)")
              .font(WidgetFont.display(18))
              .monospacedDigit()
            Image(systemName: "checkmark.circle.fill")
              .font(.system(size: 13, weight: .bold))
              .foregroundStyle(Palette.dark.pandan)
          }
          .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            NextSetLine(
              state: context.state, workoutId: context.attributes.workoutId, palette: .dark)
            if let ends = context.state.restEndsAt, ends > Date() {
              RestLine(
                ends: ends, total: context.state.restTotalS,
                workoutId: context.attributes.workoutId, labels: context.state.labels,
                palette: .dark)
            }
          }
          .padding(.horizontal, 4)
        }
      } compactLeading: {
        WorkoutIcon(size: 20)
      } compactTrailing: {
        CompactClock(state: context.state, startedAt: context.attributes.startedAt)
      } minimal: {
        if let ends = context.state.restEndsAt, ends > Date() {
          Text(timerInterval: Date()...ends, countsDown: true)
            .font(WidgetFont.label(12))
            .monospacedDigit()
            .foregroundStyle(Palette.dark.kaya)
            .frame(width: 36)
        } else {
          WorkoutIcon(size: 18)
        }
      }
      .widgetURL(WorkoutLink.logger)
      .keylineTint(Palette.dark.pandan)
    }
  }
}

private enum WorkoutLink {
  static var logger: URL {
    let scheme =
      (Bundle.main.object(forInfoDictionaryKey: "RiceCalScheme") as? String) ?? "ricecal"
    return URL(string: "\(scheme)://workout/resume")!
  }
}

private struct WorkoutLockScreen: View {
  let context: ActivityViewContext<WorkoutActivityAttributes>
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let palette = colorScheme == .dark ? Palette.dark : Palette.light
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 10) {
        WorkoutIcon(size: 34)
        VStack(alignment: .leading, spacing: 1) {
          Text(context.state.name)
            .font(WidgetFont.display(19))
            .foregroundStyle(palette.heading)
            .lineLimit(1)
          Text("\(context.state.done)/\(context.state.total) ✓")
            .font(WidgetFont.label(13))
            .foregroundStyle(palette.muted)
        }
        Spacer(minLength: 8)
        ElapsedClock(startedAt: context.attributes.startedAt)
          .font(WidgetFont.display(26))
          .multilineTextAlignment(.trailing)
          .foregroundStyle(palette.pandanInk)
          .frame(maxWidth: 110, alignment: .trailing)
      }
      NextSetLine(state: context.state, workoutId: context.attributes.workoutId, palette: palette)
      if let ends = context.state.restEndsAt, ends > Date() {
        RestLine(
          ends: ends, total: context.state.restTotalS, workoutId: context.attributes.workoutId,
          labels: context.state.labels, palette: palette)
      }
    }
    .padding(16)
    .activityBackgroundTint(palette.surface)
    .activitySystemActionForegroundColor(palette.heading)
  }
}

private struct NextSetLine: View {
  let state: WorkoutActivityAttributes.ContentState
  let workoutId: String
  let palette: Palette

  var body: some View {
    HStack(spacing: 6) {
      Text(state.exercise)
        .font(WidgetFont.label(15))
        .foregroundStyle(palette.ink)
        .lineLimit(1)
      if !state.set.isEmpty {
        Text(state.set)
          .font(WidgetFont.label(13))
          .foregroundStyle(palette.pandanInk)
          .padding(.horizontal, 7)
          .padding(.vertical, 2)
          .background(Capsule().fill(palette.pandanSoft))
      }
      Spacer(minLength: 6)
      // Ticks the set named beside it, with the numbers it offers, and starts
      // its rest: a set done between two locks of the phone without opening it.
      if #available(iOS 17.0, *), state.canComplete == true,
        let exerciseKey = state.exerciseKey, let setId = state.setId
      {
        Button(
          intent: WorkoutActionIntent(
            action: "completeSet", workoutId: workoutId, exerciseKey: exerciseKey, setId: setId)
        ) {
          Image(systemName: "checkmark")
            .font(.system(size: 15, weight: .heavy))
            .foregroundStyle(palette.canvas)
            .frame(width: 44, height: 30)
            .background(Capsule().fill(palette.pandan))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(ifPresent: state.labels?.complete)
      }
    }
  }
}

private struct RestLine: View {
  let ends: Date
  let total: Double?
  let workoutId: String
  let labels: WorkoutActivityAttributes.ActionLabels?
  let palette: Palette

  var body: some View {
    let start = ends.addingTimeInterval(-(total ?? 60))
    HStack(spacing: 8) {
      Text(timerInterval: start...ends, countsDown: true)
        .font(WidgetFont.display(18))
        .monospacedDigit()
        .foregroundStyle(palette.kayaInk)
        .frame(width: 52, alignment: .leading)
      ProgressView(timerInterval: start...ends, countsDown: true) {
        EmptyView()
      } currentValueLabel: {
        EmptyView()
      }
      .tint(palette.kaya)
      // The rest's own controls, the three the logger's rest bar has.
      if #available(iOS 17.0, *) {
        RestButton(
          action: "restMinus", workoutId: workoutId, label: labels?.less, palette: palette
        ) {
          Text("−15").font(WidgetFont.label(13))
        }
        RestButton(
          action: "restPlus", workoutId: workoutId, label: labels?.more, palette: palette
        ) {
          Text("+15").font(WidgetFont.label(13))
        }
        RestButton(
          action: "skipRest", workoutId: workoutId, label: labels?.skip, palette: palette
        ) {
          Image(systemName: "forward.end.fill").font(.system(size: 12, weight: .bold))
        }
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    .background(RoundedRectangle(cornerRadius: 14).fill(palette.kayaSoft))
  }
}

@available(iOS 17.0, *)
private struct RestButton<Label: View>: View {
  let action: String
  let workoutId: String
  /// What VoiceOver says. Nil on content from a build that sent none.
  let label: String?
  let palette: Palette
  @ViewBuilder let face: () -> Label

  var body: some View {
    Button(intent: WorkoutActionIntent(action: action, workoutId: workoutId)) {
      face()
        .foregroundStyle(palette.kayaInk)
        .frame(width: 40, height: 28)
        .background(Capsule().fill(palette.surface.opacity(0.7)))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(ifPresent: label)
  }
}

private struct CompactClock: View {
  let state: WorkoutActivityAttributes.ContentState
  let startedAt: Date

  var body: some View {
    if let ends = state.restEndsAt, ends > Date() {
      Text(timerInterval: Date()...ends, countsDown: true)
        .font(WidgetFont.label(14))
        .monospacedDigit()
        .foregroundStyle(Palette.dark.kaya)
        .frame(width: 44, alignment: .trailing)
    } else {
      ElapsedClock(startedAt: startedAt)
        .font(WidgetFont.label(14))
        .foregroundStyle(Palette.dark.pandan)
        .frame(width: 52, alignment: .trailing)
    }
  }
}

/**
 How long the workout has run, as a clock that counts up by itself.

 `Text(timerInterval:)` rather than `Text(_:style: .timer)`: the second is
 allowed to round itself to words on the lock screen ("3 minutes"), and a
 workout clock that stops reading as a clock is no use between sets.

 The range ends a day after the start, the longest a workout can be saved
 for, rather than open-ended. While the lock screen is dimmed iOS redraws it
 once a minute and draws the seconds as dashes ("19:--"). That is the system:
 the same clock reads in full as soon as the screen wakes.
 */
private struct ElapsedClock: View {
  let startedAt: Date

  var body: some View {
    Text(timerInterval: startedAt...startedAt.addingTimeInterval(24 * 60 * 60), countsDown: false)
      .monospacedDigit()
  }
}

private struct WorkoutIcon: View {
  let size: CGFloat

  var body: some View {
    WidgetIcon(name: "wg-dumbbell", fallback: "dumbbell.fill", size: size)
  }
}

extension View {
  /// A VoiceOver name when the app sent one, and the system's own otherwise.
  @ViewBuilder
  fileprivate func accessibilityLabel(ifPresent label: String?) -> some View {
    if let label { accessibilityLabel(Text(label)) } else { self }
  }
}
