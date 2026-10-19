import Foundation
import SwiftUI
import WatchKit

/**
 Everything the watch app draws, and every press it makes.

 The phone is the record of the running workout. What is drawn is the phone's
 last state with the presses it has not yet confirmed laid over it
 (`project`), so a press shows at once, holds while the phone is out of reach,
 and gives way to the phone's own copy as soon as that copy includes it: the
 state says how far through the watch's commands it got (`appliedSeq`), and
 those leave `pending`. Until then the whole of `pending` is sent again whenever
 the phone may have missed it.

 Both halves are kept in the defaults, so a watch app relaunched mid-workout
 picks up where it was, and so do presses still waiting for the phone.
 */
@MainActor
final class WatchStore: ObservableObject {
  static let shared = WatchStore()

  @Published private(set) var phone: WatchState? {
    didSet { refresh() }
  }
  @Published private(set) var pending: [WatchCommand] = [] {
    didSet { refresh() }
  }
  /// The phone's workout with the presses it has not confirmed laid over it,
  /// worked out when either changes rather than on every read from a view.
  @Published private(set) var workout: WatchWorkout?
  @Published private(set) var reachable = false
  @Published private(set) var heartRate: Int?
  @Published private(set) var activeKcal: Double = 0
  /// What the last workout finished here came to, until it is dismissed.
  @Published var summary: Summary?
  /// A set picked from the list, drawn instead of the next one until done.
  @Published var picked: String?
  @Published var page: Page = .set

  enum Page: Hashable { case controls, set, exercises }

  struct Summary: Equatable {
    var workoutId: String
    var name: String
    var durationS: Double
    var sets: Int
    var avgBpm: Int?
    var kcal: Double?
  }

  private let link = PhoneLink.shared
  private let recorder = WorkoutRecorder.shared
  private let defaults = UserDefaults.standard
  private var restTimer: Timer?
  private var restBuzzedFor: Double?
  private var lastPulse = Date.distantPast
  private var lastHeartAt = Date.distantPast
  private var lastResend = Date.distantPast
  /// Heart rate traces the phone has not yet said it has.
  private var unsent: [HeartTrace] = []
  private var announced: Set<String> = []
  private var readings: [Int] = []
  /// The phone launched this app to record its workout.
  private var recordWhenKnown = false
  /// A workout whose session would not start, not tried again until the app
  /// is next opened: every state from the phone would otherwise try again.
  private var couldNotRecord: String?

  private init() {
    if let text = defaults.string(forKey: "RiceCalPhoneState") {
      phone = Wire.decode(WatchState.self, text)
    }
    if let text = defaults.string(forKey: "RiceCalPending") {
      pending = Wire.decode([WatchCommand].self, text) ?? []
    }
    if let text = defaults.string(forKey: "RiceCalUnsentTraces") {
      unsent = Wire.decode([HeartTrace].self, text) ?? []
    }
    // Assignments in an initialiser do not run `didSet`.
    refresh()
    link.onState = { [weak self] text in
      DispatchQueue.main.async { self?.receive(text) }
    }
    link.onReachability = { [weak self] reachable in
      DispatchQueue.main.async { self?.reachable = reachable }
    }
    link.onReady = { [weak self] in
      DispatchQueue.main.async { self?.resend(force: true) }
    }
    recorder.onRecovered = { [weak self] in self?.reconcile() }
    recorder.onHeartRate = { [weak self] bpm in self?.pulse(bpm) }
    recorder.onEnergy = { [weak self] kcal in
      self?.activeKcal = kcal
      self?.stream()
    }
  }

  /// The app came to the wrist: a running workout can start recording now.
  func becameActive() {
    couldNotRecord = nil
    reachable = link.isReachable
    link.askForState()
    resend(force: true)
    reconcile()
  }

  func launch() {
    link.activate()
    recorder.recover()
    reachable = link.isReachable
    reconcile()
  }

  // MARK: What is drawn

  var labels: [String: String] { phone?.labels ?? [:] }
  func label(_ key: String) -> String { labels[key] ?? Labels.english[key] ?? key }

  var unit: String { phone?.unit ?? "kg" }
  var distanceUnit: String { phone?.distanceUnit ?? "km" }
  var signedIn: Bool { phone?.signedIn ?? false }
  var routines: [WatchRoutine] { phone?.routines ?? [] }

  private func refresh() {
    let projected = Self.project(phone?.workout, pending: pending)
    if projected != workout { workout = projected }
  }

  /// Whether presses are still on their way to the phone.
  var syncing: Bool { !pending.isEmpty }

  /// The set the set page draws: the one picked, or the next to do.
  func current(in workout: WatchWorkout) -> (exercise: WatchExercise, set: WatchSet)? {
    if let picked {
      for exercise in workout.exercises {
        if let set = exercise.sets.first(where: { $0.id == picked }) { return (exercise, set) }
      }
    }
    return Self.next(in: workout)
  }

  /// Whether this set is the first or the last in the order the workout is done.
  func ends(of setId: String) -> (first: Bool, last: Bool) {
    let order = workout.map(Self.walk) ?? []
    guard let index = order.firstIndex(where: { $0.set.id == setId }) else { return (true, true) }
    return (index == 0, index == order.count - 1)
  }

  /// Moves the set page to the set before or after the one it shows.
  func step(from setId: String, by offset: Int) {
    let order = workout.map(Self.walk) ?? []
    guard let index = order.firstIndex(where: { $0.set.id == setId }),
      order.indices.contains(index + offset)
    else { return }
    WKInterfaceDevice.current().play(.click)
    picked = order[index + offset].set.id
  }

  /// The letter a warm-up, drop or failure set is marked with; nothing for a working set.
  func badge(for kind: String) -> String? {
    ["warmup", "drop", "failure"].contains(kind) ? label(kind) : nil
  }

  // MARK: From the phone

  private func receive(_ text: String) {
    guard let state = Wire.decode(WatchState.self, text) else { return }
    // States can arrive out of order, by context and by message.
    if let phone, state.rev < phone.rev { return }
    phone = state
    defaults.set(text, forKey: "RiceCalPhoneState")
    prune()
    resend()
    reconcile()
  }

  /// Drops the presses the phone's copy now includes, or has moved past.
  private func prune() {
    guard let phone else { return }
    let ended = Set(phone.ended.map(\.id))
    let before = pending.count
    pending.removeAll { command in
      if ended.contains(command.workoutId) { return true }
      guard let running = phone.workout else { return false }
      if running.id == command.workoutId { return command.seq <= running.appliedSeq }
      // The phone is running another workout and has spoken since this
      // press: it will not apply it, and its own workout is the one to follow.
      return phone.rev > command.at
    }
    if pending.count != before {
      savePending()
      // So the copy the system keeps for the phone is the shorter list.
      link.sendPending(pending)
    }
    let unsentBefore = unsent.count
    unsent.removeAll { phone.heard.contains($0.workoutId) }
    if unsent.count != unsentBefore { saveUnsent() }
  }

  /**
   Sends again what the phone may have missed: the commands it has not
   confirmed, and the traces it has not said it has. Not more than every few
   seconds, since every state that arrives calls this.
   */
  private func resend(force: Bool = false) {
    let now = Date()
    guard force || now.timeIntervalSince(lastResend) > 3 else { return }
    lastResend = now
    if !pending.isEmpty { link.sendPending(pending) }
    for trace in unsent { link.send(trace, queueIfAway: false) }
  }

  /**
   Rises with every press and across relaunches, starting from the clock in
   milliseconds, so a reinstalled app's first press is still past anything the
   phone applied before it.
   */
  private func nextSeq() -> Double {
    let now = (Date().timeIntervalSince1970 * 1000).rounded()
    let seq = max(now, defaults.double(forKey: "RiceCalLastSeq") + 1)
    defaults.set(seq, forKey: "RiceCalLastSeq")
    return seq
  }

  // MARK: Presses

  private func enqueue(_ command: WatchCommand) {
    pending.append(command)
    savePending()
    link.sendPending(pending)
    reconcile()
  }

  private func savePending() {
    defaults.set(Wire.encode(pending), forKey: "RiceCalPending")
  }

  private func saveUnsent() {
    defaults.set(Wire.encode(unsent), forKey: "RiceCalUnsentTraces")
  }

  func start(_ routine: WatchRoutine) {
    let workoutId = UUID().uuidString.lowercased()
    let exercises = routine.exercises.map { exercise in
      StartExercise(
        key: UUID().uuidString.lowercased(),
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        tracking: exercise.tracking,
        restS: exercise.ownRestS,
        superset: exercise.superset,
        sets: exercise.sets.map { set in
          let plan = set.plan ?? Figures()
          return StartSet(
            id: UUID().uuidString.lowercased(), kind: set.kind,
            weightKg: plan.weightKg, reps: plan.reps, durationS: plan.durationS,
            distanceM: plan.distanceM, shown: set.figures, restS: set.restS)
        })
    }
    summary = nil
    picked = nil
    page = .set
    // The workout it makes is the one drawn at once, and `reconcile`, which
    // runs on every press, starts its session.
    enqueue(
      WatchCommand(
        seq: nextSeq(), workoutId: workoutId, type: "start", routineId: routine.id, name: routine.name,
        exercises: exercises))
  }

  func complete(_ exercise: WatchExercise, _ set: WatchSet, figures: Figures) {
    guard let workout else { return }
    WKInterfaceDevice.current().play(.success)
    picked = nil
    enqueue(
      WatchCommand(
        seq: nextSeq(), workoutId: workout.id, type: "complete", exerciseKey: exercise.key, setId: set.id,
        weightKg: figures.weightKg, reps: figures.reps, durationS: figures.durationS,
        distanceM: figures.distanceM, restS: set.restS))
  }

  func undo(_ exercise: WatchExercise, _ set: WatchSet) {
    guard let workout else { return }
    WKInterfaceDevice.current().play(.click)
    enqueue(
      WatchCommand(seq: nextSeq(), workoutId: workout.id, type: "uncomplete", exerciseKey: exercise.key, setId: set.id))
  }

  func addSet(to exercise: WatchExercise) {
    guard let workout else { return }
    let id = UUID().uuidString.lowercased()
    enqueue(WatchCommand(seq: nextSeq(), workoutId: workout.id, type: "addSet", exerciseKey: exercise.key, setId: id))
    picked = id
    page = .set
  }

  func adjustRest(by seconds: Double) {
    guard let workout, workout.rest != nil else { return }
    WKInterfaceDevice.current().play(.click)
    enqueue(WatchCommand(seq: nextSeq(), workoutId: workout.id, type: "restAdjust", byS: seconds))
  }

  func skipRest() {
    guard let workout, workout.rest != nil else { return }
    enqueue(WatchCommand(seq: nextSeq(), workoutId: workout.id, type: "restSkip"))
  }

  /// Saves the workout: the phone saves the sets done, the watch its session.
  func finish() {
    guard let workout else { return }
    let end = Date()
    let durationS = end.timeIntervalSince1970 - workout.startedAt / 1000
    summary = Summary(
      workoutId: workout.id, name: workout.name, durationS: max(0, durationS),
      sets: Self.doneSets(workout),
      avgBpm: readings.isEmpty ? nil : readings.reduce(0, +) / readings.count,
      kcal: activeKcal > 0 ? activeKcal : nil)
    enqueue(WatchCommand(seq: nextSeq(), workoutId: workout.id, type: "finish", endedAt: end.timeIntervalSince1970 * 1000))
    endRecording(saved: true, at: end, workoutId: workout.id)
    WKInterfaceDevice.current().play(.success)
  }

  func discard() {
    guard let workout else { return }
    enqueue(WatchCommand(seq: nextSeq(), workoutId: workout.id, type: "discard"))
    endRecording(saved: false, at: Date(), workoutId: workout.id)
  }

  // MARK: The session

  /// The phone asked HealthKit to launch this app for its running workout.
  func phoneAskedToRecord() {
    recordWhenKnown = true
    link.askForState()
    reconcile()
  }

  /**
   Keeps the workout session in step with what is drawn: started for a
   running workout this app is open on, named once the phone says which it
   is, saved or thrown away when the phone says how the workout ended.
   */
  private func reconcile() {
    scheduleRestBuzz()
    let running = workout
    if recorder.isRecording {
      let recording = recorder.workoutId
      // The phone says how its workout ended: saved, or thrown away.
      if let recording, let ended = phone?.ended.first(where: { $0.id == recording }) {
        // A trace the phone already has came from another watch, the one
        // worn for the rest of the workout, and that one is the recording.
        // Saved here as well, it made a second Health copy and sent a trace
        // with nothing in it that replaced the real one.
        let recordedElsewhere = phone?.heard.contains(recording) == true
        endRecording(
          saved: ended.saved && !recordedElsewhere,
          at: Date(timeIntervalSince1970: ended.at / 1000), workoutId: recording)
        return
      }
      guard let running else {
        // Nothing running, nothing on its way to the phone about it, and the
        // phone has no word of its workout: a session HealthKit kept from
        // long ago, which would otherwise run on, and drain the battery,
        // until the next workout took it over.
        if phone != nil, !pending.contains(where: { $0.workoutId == recording }) {
          discardRecording()
        }
        return
      }
      if recording != running.id {
        let started = Date(timeIntervalSince1970: running.startedAt / 1000)
        if let since = recorder.startDate, since < started.addingTimeInterval(-10 * 60) {
          // Begun well before this workout: not its recording. Adopted, it
          // put half an hour of somebody else's pulse at the head of a
          // two-minute workout.
          discardRecording()
          reconcile()
          return
        }
        // The phone launched this app before naming its workout, or kept
        // its own workout over one started here: either way, this session
        // is the one on the wrist.
        recorder.attach(running.id)
      }
      announce(running)
      return
    }
    guard let running, summary?.workoutId != running.id, couldNotRecord != running.id else { return }
    // A session HealthKit kept may be on its way back, or one is already
    // starting; starting another now would make two. Each calls this again
    // when it is done.
    guard !recorder.isRecovering, !recorder.isStarting else { return }
    // Only on the wrist, or when the phone launched this app for it: a
    // session cannot be started from the background otherwise.
    let active = WKApplication.shared().applicationState == .active
    guard active || recordWhenKnown else { return }
    recordWhenKnown = false
    let started = Date(timeIntervalSince1970: running.startedAt / 1000)
    // A workout started hours ago on the phone is recorded from now: a
    // session reaching that far back would be mostly time nobody measured.
    let from = Date().timeIntervalSince(started) < 3 * 3600 ? started : Date()
    let id = running.id
    Task {
      await recorder.requestAuthorization()
      if await recorder.start(workoutId: id, startDate: from) {
        reconcile()
      } else {
        couldNotRecord = id
      }
    }
  }

  /// Tells the phone the watch records this workout, so it saves no Health copy of its own.
  private func announce(_ workout: WatchWorkout) {
    guard !workout.recorded, !announced.contains(workout.id) else { return }
    announced.insert(workout.id)
    enqueue(WatchCommand(seq: nextSeq(), workoutId: workout.id, type: "recording"))
  }

  private func endRecording(saved: Bool, at end: Date, workoutId: String) {
    guard recorder.isRecording, recorder.workoutId == workoutId || recorder.workoutId == nil else {
      return
    }
    if recorder.workoutId == nil { recorder.attach(workoutId) }
    if !saved {
      discardRecording()
      return
    }
    heartRate = nil
    readings = []
    activeKcal = 0
    Task {
      if let trace = await recorder.finish(endDate: end) {
        unsent.removeAll { $0.workoutId == trace.workoutId }
        unsent.append(trace)
        saveUnsent()
        link.send(trace, queueIfAway: true)
        if summary?.workoutId == trace.workoutId {
          let heard = trace.bpm.compactMap { $0 }
          if !heard.isEmpty { summary?.avgBpm = heard.reduce(0, +) / heard.count }
        }
      }
    }
  }

  private func discardRecording() {
    recorder.discard()
    heartRate = nil
    readings = []
    activeKcal = 0
  }

  private func pulse(_ bpm: Int) {
    heartRate = bpm
    lastHeartAt = Date()
    readings.append(bpm)
    stream()
  }

  /// The heart rate and the energy so far, for the phone's logger, at most
  /// every five seconds. Energy comes either way: it is measured with heart
  /// rate refused, and the phone shows it rather than its own estimate.
  private func stream() {
    guard let id = recorder.workoutId, Date().timeIntervalSince(lastPulse) >= 5 else { return }
    lastPulse = Date()
    // A reading is resent only while it is recent, so a loose strap does not
    // keep its last figure looking live on the phone.
    let bpm = Date().timeIntervalSince(lastHeartAt) < 15 ? heartRate : nil
    link.sendPulse(workoutId: id, bpm: bpm, kcal: activeKcal > 0 ? activeKcal : nil)
  }

  /// A tap on the wrist when a rest ends, which is the whole point of a rest timer on a watch.
  private func scheduleRestBuzz() {
    restTimer?.invalidate()
    restTimer = nil
    guard let rest = workout?.rest else { return }
    let wait = rest.endsAt / 1000 - Date().timeIntervalSince1970
    guard wait > 0, restBuzzedFor != rest.endsAt else { return }
    restTimer = Timer.scheduledTimer(withTimeInterval: wait, repeats: false) { [weak self] _ in
      Task { @MainActor in
        guard let self, self.workout?.rest?.endsAt == rest.endsAt else { return }
        self.restBuzzedFor = rest.endsAt
        WKInterfaceDevice.current().play(.stop)
      }
    }
  }

  // MARK: Pure parts

  /// The phone's workout with the presses it has not confirmed laid over it.
  static func project(_ base: WatchWorkout?, pending: [WatchCommand]) -> WatchWorkout? {
    var workout = base
    for command in pending {
      if command.type == "start" {
        if workout == nil { workout = started(command) }
        continue
      }
      guard var current = workout, current.id == command.workoutId else { continue }
      switch command.type {
      case "complete":
        var newlyDone = false
        update(&current, command) { set in
          newlyDone = !set.done
          set.figures = Figures(
            weightKg: command.weightKg, reps: command.reps, durationS: command.durationS,
            distanceM: command.distanceM)
          set.done = true
        }
        if newlyDone, let restS = command.restS, restS > 0 {
          current.rest = WatchRest(endsAt: command.at + restS * 1000, totalS: restS)
        }
      case "uncomplete":
        update(&current, command) { set in set.done = false }
      case "addSet":
        if let index = current.exercises.firstIndex(where: { $0.key == command.exerciseKey }),
          let setId = command.setId,
          !current.exercises[index].sets.contains(where: { $0.id == setId })
        {
          let last = current.exercises[index].sets.last
          current.exercises[index].sets.append(
            WatchSet(
              id: setId, kind: "normal", done: false, figures: last?.figures ?? Figures(),
              restS: last?.restS ?? 0))
        }
      case "restAdjust":
        if var rest = current.rest {
          rest.endsAt += (command.byS ?? 0) * 1000
          rest.totalS = max(1, rest.totalS + (command.byS ?? 0))
          current.rest = rest.endsAt > Date().timeIntervalSince1970 * 1000 ? rest : nil
        }
      case "restSkip":
        current.rest = nil
      case "recording":
        current.recorded = true
      case "finish", "discard":
        workout = nil
        continue
      default:
        break
      }
      workout = current
    }
    return workout
  }

  private static func update(
    _ workout: inout WatchWorkout, _ command: WatchCommand, _ change: (inout WatchSet) -> Void
  ) {
    guard let e = workout.exercises.firstIndex(where: { $0.key == command.exerciseKey }),
      let s = workout.exercises[e].sets.firstIndex(where: { $0.id == command.setId })
    else { return }
    change(&workout.exercises[e].sets[s])
  }

  private static func started(_ command: WatchCommand) -> WatchWorkout {
    WatchWorkout(
      id: command.workoutId, name: command.name ?? "", startedAt: command.at, rest: nil,
      recorded: false, appliedSeq: 0,
      exercises: (command.exercises ?? []).map { exercise in
        WatchExercise(
          key: exercise.key, exerciseId: exercise.exerciseId, name: exercise.name,
          tracking: exercise.tracking, superset: exercise.superset, ownRestS: exercise.restS,
          sets: exercise.sets.map { set in
            WatchSet(
              id: set.id, kind: set.kind, done: false,
              figures: set.shown
                ?? Figures(
                  weightKg: set.weightKg, reps: set.reps, durationS: set.durationS,
                  distanceM: set.distanceM),
              restS: set.restS ?? 0)
          })
      })
  }

  /**
   Every set in the order a workout is done. A superset is the run of
   neighbouring exercises sharing its number, done a round at a time, so after
   A1 comes B1. The phone's Live Activity walks it the same way.
   */
  static func walk(_ workout: WatchWorkout) -> [(exercise: WatchExercise, set: WatchSet)] {
    var order: [(exercise: WatchExercise, set: WatchSet)] = []
    var start = 0
    let exercises = workout.exercises
    while start < exercises.count {
      var end = start + 1
      if let group = exercises[start].superset {
        while end < exercises.count, exercises[end].superset == group { end += 1 }
      }
      let run = exercises[start..<end]
      let rounds = run.map(\.sets.count).max() ?? 0
      for index in 0..<rounds {
        for exercise in run where index < exercise.sets.count {
          order.append((exercise, exercise.sets[index]))
        }
      }
      start = end
    }
    return order
  }

  /// The set to do next: the first not done, in that order.
  static func next(in workout: WatchWorkout) -> (exercise: WatchExercise, set: WatchSet)? {
    walk(workout).first { !$0.set.done }
  }

  static func doneSets(_ workout: WatchWorkout) -> Int {
    workout.exercises.reduce(0) { $0 + $1.sets.filter(\.done).count }
  }
}
