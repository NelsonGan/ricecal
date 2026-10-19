import SwiftUI

/**
 A running workout, as three pages side by side: the controls on the left,
 the set to do in the middle, where it opens, and every exercise on the right.
 The same arrangement as the Workout app's, so a swipe goes where a wrist
 already expects.
 */
struct WorkoutView: View {
  @EnvironmentObject private var store: WatchStore
  let workout: WatchWorkout

  var body: some View {
    NavigationStack {
      TabView(selection: $store.page) {
        ControlsPage(workout: workout).tag(WatchStore.Page.controls)
        SetPage(workout: workout).tag(WatchStore.Page.set)
        ExercisesPage(workout: workout).tag(WatchStore.Page.exercises)
      }
      .tabViewStyle(.page(indexDisplayMode: .automatic))
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Text(
            timerInterval: Date(timeIntervalSince1970: workout.startedAt / 1000)...Date.distantFuture,
            countsDown: false
          )
          .font(.system(.footnote, design: .rounded).monospacedDigit().weight(.semibold))
          .foregroundStyle(Palette.kaya)
        }
      }
      .navigationDestination(for: String.self) { key in
        if let exercise = workout.exercises.first(where: { $0.key == key }) {
          ExerciseSetsView(exercise: exercise)
        }
      }
    }
  }
}

/// The heart rate the session is reading, when it is reading one. Checked on
/// a clock of its own, so a reading that stops coming goes after fifteen
/// seconds even if nothing else is sent.
struct HeartBadge: View {
  @EnvironmentObject private var store: WatchStore

  var body: some View {
    TimelineView(.periodic(from: .now, by: 5)) { context in
      if let bpm = store.liveHeartRate(at: context.date) {
        HStack(spacing: 2) {
          Image(systemName: "heart.fill")
            .font(.system(size: 10))
          Text("\(bpm)")
            .font(.system(.footnote, design: .rounded).monospacedDigit().weight(.semibold))
        }
        .foregroundStyle(Palette.hibiscus)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(store.label("heartRate")) \(bpm) \(store.label("bpm"))")
      }
    }
  }
}

// MARK: The set page

/**
 The set to do: the exercise, which set of how many, its figures in two boxes,
 and under them the set before, a tick and the set after. Tapping a box picks
 it and the Digital Crown changes it, a plate at a time; the figures start at
 what the phone offers (typed, or last time's), so most sets are a single tap.
 While a rest runs it is the rest.
 */
struct SetPage: View {
  @EnvironmentObject private var store: WatchStore
  let workout: WatchWorkout

  var body: some View {
    Group {
      if let rest = workout.rest {
        TimelineView(.periodic(from: .now, by: 1)) { context in
          if rest.endsAt > context.date.timeIntervalSince1970 * 1000 {
            RestView(rest: rest, workout: workout)
          } else {
            setOrDone
          }
        }
      } else {
        setOrDone
      }
    }
    .overlay {
      if store.restDoneAt != nil {
        RestDoneCard(next: WatchStore.next(in: workout)?.exercise.name)
          .transition(.opacity.combined(with: .scale(scale: 0.9)))
          .onTapGesture { withAnimation { store.restDoneAt = nil } }
      }
    }
    .animation(.spring(duration: 0.3, bounce: 0.3), value: store.restDoneAt)
  }

  @ViewBuilder private var setOrDone: some View {
    if let current = store.current(in: workout) {
      SetEditor(exercise: current.exercise, set: current.set)
        .id(current.set.id)
    } else {
      VStack(spacing: 8) {
        Image(systemName: workout.exercises.isEmpty ? "iphone" : "checkmark.circle.fill")
          .font(.system(size: 30))
          .foregroundStyle(Palette.pandan)
        Text(store.label(workout.exercises.isEmpty ? "empty" : "allDone"))
          .font(.system(.headline, design: .rounded))
          .multilineTextAlignment(.center)
        if !workout.exercises.isEmpty {
          Button(store.label("end")) { store.page = .controls }
            .tint(Palette.pandan)
        }
      }
    }
  }
}

private enum Field: Hashable { case weight, reps, duration, distance }

private struct SetEditor: View {
  @EnvironmentObject private var store: WatchStore
  let exercise: WatchExercise
  let set: WatchSet

  @State private var draft = Figures()
  @State private var focus: Field = .weight
  @State private var crown: Double = 0
  @State private var ready = false
  /// The crown has moved a figure here. Until then the figures follow the
  /// phone's, so a weight typed there while this set was on the wrist is the
  /// one completing it here sends.
  @State private var touched = false

  private var fields: [Field] {
    switch exercise.tracking {
    case "reps": return [.reps]
    case "duration": return [.duration]
    case "distance_duration": return [.distance, .duration]
    case "weight_distance": return [.weight, .distance]
    default: return [.weight, .reps]
    }
  }

  private var index: Int { (exercise.sets.firstIndex(where: { $0.id == set.id }) ?? 0) + 1 }

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(exercise.name)
        .font(.system(.headline, design: .rounded))
        .lineLimit(2)
        .minimumScaleFactor(0.8)
      HStack(spacing: 4) {
        Text("\(store.label("set")) \(index)/\(exercise.sets.count)")
          .font(.system(.footnote, design: .rounded).monospacedDigit())
          .foregroundStyle(Palette.muted)
        if let badge = store.badge(for: set.kind) {
          Text(badge)
            .font(.system(size: 11, weight: .bold, design: .rounded))
            .foregroundStyle(Palette.kaya)
        }
        Spacer(minLength: 0)
        HeartBadge()
      }
      HStack(spacing: 6) {
        ForEach(fields, id: \.self) { field in
          fieldBox(field, selected: focus == field && !set.done)
            .onTapGesture { select(field) }
        }
      }
      .focusable(!set.done)
      .digitalCrownRotation(
        $crown, from: 0, through: range(focus), by: step(focus), sensitivity: sensitivity(focus),
        isContinuous: false, isHapticFeedbackEnabled: true)
      .onChange(of: crown) { _, value in
        guard ready else { return }
        touched = true
        write(value, to: focus)
      }
      .onChange(of: set.figures) { _, figures in
        guard !touched else { return }
        draft = figures
        point(focus)
      }

      Spacer(minLength: 0)

      // The set before, the tick, the set after: the tick completes this set,
      // or takes back one already done, and the arrows walk the workout in
      // the order it is done, so any set can be looked at or fixed.
      let ends = store.ends(of: set.id)
      HStack(spacing: 6) {
        StepButton(systemImage: "chevron.left", label: store.label("previousSet"), enabled: !ends.first) {
          store.step(from: set.id, by: -1)
        }
        tick
        StepButton(systemImage: "chevron.right", label: store.label("nextSet"), enabled: !ends.last) {
          store.step(from: set.id, by: 1)
        }
      }
    }
    .onAppear {
      draft = set.figures
      focus = fields.first ?? .reps
      point(focus)
    }
  }

  /// Filled to complete the set; an outline on a completed one, to take it back.
  private var tick: some View {
    Button {
      if set.done { store.undo(exercise, set) } else { store.complete(exercise, set, figures: draft) }
    } label: {
      Image(systemName: "checkmark")
        .font(.system(size: 22, weight: .heavy))
        .foregroundStyle(set.done ? Palette.pandan : Palette.onPandan)
        .frame(maxWidth: .infinity, minHeight: 46)
        .background(Capsule().fill(set.done ? Palette.pandanSoft : Palette.pandan))
        .overlay(Capsule().strokeBorder(Palette.pandan, lineWidth: set.done ? 1.5 : 0))
    }
    .buttonStyle(.plain)
    .opacity(set.done || loggable ? 1 : 0.4)
    .disabled(!set.done && !loggable)
    .accessibilityLabel(store.label(set.done ? "undo" : "completeSet"))
  }

  /// The same test the phone's tick makes, so the button is never pressed for nothing.
  private var loggable: Bool {
    switch exercise.tracking {
    case "weight_reps": return (draft.reps ?? 0) > 0 && draft.weightKg != nil
    case "reps", "weighted_reps", "assisted_reps": return (draft.reps ?? 0) > 0
    case "duration": return (draft.durationS ?? 0) > 0
    case "distance_duration": return (draft.durationS ?? 0) > 0 || (draft.distanceM ?? 0) > 0
    case "weight_distance": return (draft.distanceM ?? 0) > 0
    default: return true
    }
  }

  private func select(_ field: Field) {
    guard !set.done else { return }
    focus = field
    point(field)
  }

  /// Sets the crown to a field's figure without that counting as a turn.
  private func point(_ field: Field) {
    ready = false
    crown = display(field) ?? 0
    // The crown's value moves before the field it drives does; written on
    // the next turn, setting it here is not taken as a turn of the crown.
    DispatchQueue.main.async { ready = true }
  }

  /// A figure in the unit it is read in: pounds or kilograms, km or miles.
  private func display(_ field: Field) -> Double? {
    switch field {
    case .weight:
      return draft.weightKg.map { store.unit == "lb" ? ($0 * Format.lbPerKg).rounded() : $0 }
    case .reps: return draft.reps
    case .duration: return draft.durationS
    case .distance:
      return draft.distanceM.map { store.distanceUnit == "mi" ? $0 / Format.mPerMi : $0 / 1000 }
    }
  }

  private func write(_ raw: Double, to field: Field) {
    // The crown reports every fraction of a turn, not only its detents, so
    // the figure ran through 41.37 and 41.62 on its way to 42. Each turn
    // lands on a step, which is also what the faded neighbours promise.
    let value = snapped(raw, field)
    switch field {
    case .weight:
      let kg = store.unit == "lb" ? value / Format.lbPerKg : value
      draft.weightKg = (kg * 100).rounded() / 100
    case .reps: draft.reps = value.rounded()
    case .duration: draft.durationS = value.rounded()
    case .distance:
      let metres = store.distanceUnit == "mi" ? value * Format.mPerMi : value * 1000
      draft.distanceM = (metres * 10).rounded() / 10
    }
  }

  private func range(_ field: Field) -> Double {
    switch field {
    case .weight: return store.unit == "lb" ? 1100 : 500
    case .reps: return 100
    case .duration: return 3 * 3600
    case .distance: return 100
    }
  }

  private func snapped(_ value: Double, _ field: Field) -> Double {
    let step = step(field)
    return min(range(field), max(0, (value / step).rounded() * step))
  }

  /// The figure a step either side of the one shown, for the wheel's faded rows.
  private func neighbour(_ field: Field, _ direction: Double) -> String? {
    guard let shown = display(field) else { return nil }
    let value = snapped(shown, field) + direction * step(field)
    guard value >= 0, value <= range(field) else { return nil }
    switch field {
    case .weight, .distance: return Format.trim(value)
    case .reps: return String(Int(value.rounded()))
    case .duration: return Format.clock(value)
    }
  }

  /// Slower for a weight, where a turn is many small steps; quicker for reps and time.
  private func sensitivity(_ field: Field) -> DigitalCrownRotationalSensitivity {
    switch field {
    case .weight, .distance: return .low
    case .reps, .duration: return .medium
    }
  }

  /// Half a kilogram or a pound for a weight, a rep, five seconds, fifty metres.
  private func step(_ field: Field) -> Double {
    switch field {
    case .weight: return store.unit == "lb" ? 1 : 0.5
    case .reps: return 1
    case .duration: return 5
    case .distance: return 0.05
    }
  }

  private func unitLabel(_ field: Field) -> String {
    switch field {
    case .weight: return Format.weightSign(exercise.tracking) + store.label("weightUnit")
    case .reps: return store.label("reps")
    case .duration: return store.label("time")
    case .distance: return store.label("distanceUnit")
    }
  }

  private func text(_ field: Field) -> String {
    switch field {
    case .weight: return Format.weight(draft.weightKg, unit: store.unit)
    case .reps: return draft.reps.map { String(Int($0)) } ?? "—"
    case .duration: return draft.durationS.map(Format.clock) ?? "—"
    case .distance: return Format.distance(draft.distanceM, unit: store.distanceUnit)
    }
  }

  /**
   A figure in a box. The one the crown is turning is a small wheel: the
   figure, and a step either side of it faded and cut by the box's edge, so a
   turn plainly moves to the next value rather than somewhere unknown.
   */
  private func fieldBox(_ field: Field, selected: Bool) -> some View {
    ZStack {
      if selected {
        if let before = neighbour(field, -1) {
          neighbourText(before).offset(y: -Self.wheelStep)
        }
        HStack(alignment: .firstTextBaseline, spacing: 3) {
          figure(field)
          Text(unitLabel(field))
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .foregroundStyle(Palette.muted)
            .lineLimit(1)
            .fixedSize()
        }
        .padding(.horizontal, 6)
        if let after = neighbour(field, 1) {
          neighbourText(after).offset(y: Self.wheelStep)
        }
      } else {
        VStack(spacing: 0) {
          figure(field)
          Text(unitLabel(field))
            .font(.system(size: 11, weight: .medium, design: .rounded))
            .foregroundStyle(Palette.muted)
            .lineLimit(1)
        }
        .padding(.horizontal, 6)
      }
    }
    .frame(maxWidth: .infinity)
    .frame(height: Self.boxHeight)
    .background(RoundedRectangle(cornerRadius: 12).fill(Palette.surface))
    .clipShape(RoundedRectangle(cornerRadius: 12))
    .overlay(
      RoundedRectangle(cornerRadius: 12)
        .strokeBorder(selected ? Palette.pandan : Palette.line, lineWidth: selected ? 2 : 1)
    )
    .opacity(set.done ? 0.7 : 1)
    .animation(.snappy(duration: 0.18), value: display(field))
  }

  /// Tall enough for the figure and half of each neighbour; the rest is cut off.
  private static let boxHeight: CGFloat = 64
  private static let wheelStep: CGFloat = 25

  private func figure(_ field: Field) -> some View {
    Text(text(field))
      .font(.system(size: 30, weight: .semibold, design: .rounded).monospacedDigit())
      .lineLimit(1)
      .minimumScaleFactor(0.5)
      .contentTransition(.numericText(value: display(field) ?? 0))
  }

  private func neighbourText(_ value: String) -> some View {
    Text(value)
      .font(.system(size: 17, weight: .semibold, design: .rounded).monospacedDigit())
      .foregroundStyle(.white.opacity(0.32))
      .lineLimit(1)
      .minimumScaleFactor(0.6)
      .accessibilityHidden(true)
  }
}

// MARK: The rest

/// "Rest complete", over the set page for a moment once a rest runs out.
private struct RestDoneCard: View {
  @EnvironmentObject private var store: WatchStore
  let next: String?
  @State private var ring = false

  var body: some View {
    VStack(spacing: 6) {
      ZStack {
        Circle()
          .stroke(Palette.pandan.opacity(ring ? 0 : 0.6), lineWidth: 2)
          .scaleEffect(ring ? 1.5 : 0.9)
        Circle().fill(Palette.pandan)
        Image(systemName: "checkmark")
          .font(.system(size: 24, weight: .heavy))
          .foregroundStyle(Palette.onPandan)
      }
      .frame(width: 52, height: 52)
      Text(store.label("restDone"))
        .font(.system(.headline, design: .rounded))
        .multilineTextAlignment(.center)
      if let next {
        Text(next)
          .font(.system(.footnote, design: .rounded))
          .foregroundStyle(Palette.muted)
          .lineLimit(2)
          .multilineTextAlignment(.center)
      }
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color.black.opacity(0.92))
    .onAppear {
      withAnimation(.easeOut(duration: 0.7)) { ring = true }
    }
    .accessibilityElement(children: .combine)
  }
}

private struct RestView: View {
  @EnvironmentObject private var store: WatchStore
  let rest: WatchRest
  let workout: WatchWorkout

  var body: some View {
    let end = Date(timeIntervalSince1970: rest.endsAt / 1000)
    VStack(spacing: 8) {
      HStack(spacing: 4) {
        RoundButton(systemImage: "gobackward.15", label: store.label("restMinus")) {
          store.adjustRest(by: -15)
        }
        ZStack {
          Circle().stroke(Palette.line, lineWidth: 6)
          TimelineView(.animation(minimumInterval: 0.5)) { context in
            let left = max(0, end.timeIntervalSince(context.date))
            Circle()
              .trim(from: 0, to: CGFloat(left / max(1, rest.totalS)))
              .stroke(Palette.kaya, style: StrokeStyle(lineWidth: 6, lineCap: .round))
              .rotationEffect(.degrees(-90))
          }
          VStack(spacing: 0) {
            // Never a backwards range, which traps: the page redraws as the
            // rest ends ("Rest complete" goes up then), and a clock read a
            // moment after `end` made `now...end` run backwards.
            Text(timerInterval: min(Date(), end)...end, countsDown: true)
              .font(.system(size: 24, weight: .semibold, design: .rounded).monospacedDigit())
              .multilineTextAlignment(.center)
              .minimumScaleFactor(0.6)
              .lineLimit(1)
            Text(store.label("rest"))
              .font(.system(size: 12, weight: .semibold, design: .rounded))
              .foregroundStyle(Palette.kaya)
          }
          .padding(.horizontal, 6)
        }
        // As big as the row leaves: 88 points on a 46 mm watch, less on a
        // 40 mm one, where a fixed ring pushed both buttons off the screen.
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: 88)
        RoundButton(systemImage: "goforward.15", label: store.label("restPlus")) {
          store.adjustRest(by: 15)
        }
      }
      Button {
        store.skipRest()
      } label: {
        Text(store.label("skip"))
          .font(.system(.body, design: .rounded).weight(.bold))
          .frame(maxWidth: .infinity)
          .foregroundStyle(Palette.onPandan)
      }
      .tint(Palette.pandan)
      .buttonStyle(.borderedProminent)
      HStack(spacing: 6) {
        HeartBadge()
        if let next = WatchStore.next(in: workout) {
          Text("\(store.label("upNext")): \(next.exercise.name)")
            .font(.caption2)
            .foregroundStyle(Palette.muted)
            .lineLimit(1)
        }
      }
    }
  }
}

/// One of the set page's arrows, dimmed at either end of the workout.
private struct StepButton: View {
  let systemImage: String
  let label: String
  let enabled: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.system(size: 17, weight: .bold))
        .frame(width: 40, height: 46)
        .background(Capsule().fill(Palette.surface))
    }
    .buttonStyle(.plain)
    .disabled(!enabled)
    .opacity(enabled ? 1 : 0.35)
    .accessibilityLabel(label)
  }
}

/// A small round button with a symbol, named for VoiceOver by the phone's words.
private struct RoundButton: View {
  let systemImage: String
  let label: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.system(size: 17, weight: .semibold))
        .frame(width: 38, height: 38)
        .background(Circle().fill(Palette.surface))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }
}

// MARK: The list

struct ExercisesPage: View {
  @EnvironmentObject private var store: WatchStore
  let workout: WatchWorkout

  var body: some View {
    List {
      Section(store.label("exercises")) {
        ForEach(workout.exercises) { exercise in
          let done = exercise.sets.filter(\.done).count
          NavigationLink(value: exercise.key) {
            HStack(spacing: 8) {
              ExerciseArt(exerciseId: exercise.exerciseId)
              VStack(alignment: .leading, spacing: 2) {
                Text(exercise.name)
                  .font(.system(.footnote, design: .rounded).weight(.semibold))
                  .lineLimit(2)
                Text("\(done)/\(exercise.sets.count)")
                  .font(.system(.caption2, design: .rounded).monospacedDigit())
                  .foregroundStyle(Palette.muted)
              }
              Spacer(minLength: 2)
              if done == exercise.sets.count && done > 0 {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Palette.pandan)
              }
            }
          }
        }
      }
    }
  }
}

/// One exercise's sets. Tapping one makes it the set the set page draws.
struct ExerciseSetsView: View {
  @EnvironmentObject private var store: WatchStore
  @Environment(\.dismiss) private var dismiss
  let exercise: WatchExercise

  var body: some View {
    List {
      ForEach(Array(exercise.sets.enumerated()), id: \.element.id) { index, set in
        Button {
          store.picked = set.id
          store.page = .set
          dismiss()
        } label: {
          HStack(spacing: 8) {
            let badge = store.badge(for: set.kind)
            Text(badge ?? "\(index + 1)")
              .font(.system(.footnote, design: .rounded).weight(.bold).monospacedDigit())
              .foregroundStyle(badge == nil ? Palette.muted : Palette.kaya)
              .frame(width: 18)
            Text(summary(set))
              .font(.system(.footnote, design: .rounded).monospacedDigit())
              .lineLimit(1)
              .minimumScaleFactor(0.7)
            Spacer(minLength: 2)
            Image(systemName: set.done ? "checkmark.circle.fill" : "circle")
              .foregroundStyle(set.done ? Palette.pandan : Palette.line)
          }
        }
      }
      Button {
        store.addSet(to: exercise)
        dismiss()
      } label: {
        Label(store.label("addSet"), systemImage: "plus")
      }
    }
    .navigationTitle(exercise.name)
  }

  private func summary(_ set: WatchSet) -> String {
    let weight =
      "\(Format.weightSign(exercise.tracking))\(Format.weight(set.weightKg, unit: store.unit)) \(store.label("weightUnit"))"
    let reps = set.reps.map { String(Int($0)) } ?? "—"
    switch exercise.tracking {
    case "reps": return "× \(reps)"
    case "duration": return set.durationS.map(Format.clock) ?? "—"
    case "distance_duration":
      return
        "\(Format.distance(set.distanceM, unit: store.distanceUnit)) \(store.label("distanceUnit")) · \(set.durationS.map(Format.clock) ?? "—")"
    case "weight_distance":
      return "\(weight) · \(Format.distance(set.distanceM, unit: store.distanceUnit)) \(store.label("distanceUnit"))"
    case "weighted_reps", "assisted_reps":
      // A pull-up with nothing added or taken off is its reps alone, as on the phone.
      return (set.weightKg ?? 0) > 0 ? "\(weight) × \(reps)" : "× \(reps)"
    default: return "\(weight) × \(reps)"
    }
  }
}

// MARK: The controls

struct ControlsPage: View {
  @EnvironmentObject private var store: WatchStore
  let workout: WatchWorkout
  @State private var asking = false

  var body: some View {
    let done = WatchStore.doneSets(workout)
    ScrollView {
      VStack(spacing: 8) {
        Button(role: .destructive) {
          asking = true
        } label: {
          Label(store.label("end"), systemImage: "xmark")
            .font(.system(.body, design: .rounded).weight(.bold))
            .frame(maxWidth: .infinity)
        }
        .tint(Palette.hibiscus)
        .buttonStyle(.borderedProminent)

        Grid(horizontalSpacing: 8, verticalSpacing: 8) {
          GridRow {
            Metric(label: store.label("sets"), value: "\(done)")
            Metric(
              label: store.label("heartRate"),
              value: store.liveHeartRate(at: Date()).map(String.init) ?? "—")
          }
          GridRow {
            Metric(
              label: store.label("kcal"),
              value: store.activeKcal > 0 ? String(Int(store.activeKcal.rounded())) : "—")
            Metric(label: store.label("exercises"), value: "\(workout.exercises.count)")
          }
        }

        if store.syncing && !store.reachable {
          Label(store.label("syncing"), systemImage: "iphone.radiowaves.left.and.right")
            .font(.caption2)
            .foregroundStyle(Palette.muted)
        }
      }
    }
    .confirmationDialog(
      store.label(done > 0 ? "endTitle" : "nothingTitle"), isPresented: $asking,
      titleVisibility: .visible
    ) {
      if done > 0 {
        Button(store.label("save")) { store.finish() }
      }
      Button(store.label("discard"), role: .destructive) { store.discard() }
      Button(store.label("cancel"), role: .cancel) {}
    }
  }
}

private struct Metric: View {
  let label: String
  let value: String

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(value)
        .font(.system(.title3, design: .rounded).monospacedDigit().weight(.semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      Text(label)
        .font(.system(size: 11, design: .rounded))
        .foregroundStyle(Palette.muted)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(8)
    .background(RoundedRectangle(cornerRadius: 10).fill(Palette.surface))
  }
}

// MARK: The summary

struct SummaryView: View {
  @EnvironmentObject private var store: WatchStore
  let summary: WatchStore.Summary

  var body: some View {
    ScrollView {
      VStack(spacing: 8) {
        Image(systemName: "checkmark.circle.fill")
          .font(.system(size: 34))
          .foregroundStyle(Palette.pandan)
        Text(store.label("saved"))
          .font(.system(.headline, design: .rounded))
        Text(summary.name)
          .font(.footnote)
          .foregroundStyle(Palette.muted)
          .lineLimit(2)
          .multilineTextAlignment(.center)
        Grid(horizontalSpacing: 8, verticalSpacing: 8) {
          GridRow {
            Metric(label: store.label("duration"), value: Format.clock(summary.durationS))
            Metric(label: store.label("sets"), value: "\(summary.sets)")
          }
          GridRow {
            Metric(label: store.label("bpm"), value: summary.avgBpm.map(String.init) ?? "—")
            Metric(label: store.label("kcal"), value: summary.kcal.map { String(Int($0.rounded())) } ?? "—")
          }
        }
        if store.syncing && !store.reachable {
          Text(store.label("syncing"))
            .font(.caption2)
            .foregroundStyle(Palette.muted)
            .multilineTextAlignment(.center)
        }
        Button(store.label("done")) { store.summary = nil }
          .tint(Palette.pandan)
      }
    }
  }
}
