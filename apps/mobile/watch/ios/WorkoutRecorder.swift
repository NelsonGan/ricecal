import Foundation
import HealthKit

/**
 The watch's workout session: the heart rate sensor at workout rate, energy
 measured rather than estimated, the app kept running on the wrist between
 sets, and a workout saved to Apple Health at the end.

 The saved workout carries `RiceCalWorkoutId` in its metadata, the key the
 phone's own copies carry, so the phone's Health sync knows it as one of ours
 and does not list it a second time beside the workout it belongs to. The
 phone saves no copy of its own for a workout the watch recorded.

 The recorder lives on the main actor: HealthKit calls the delegates on its
 own queues, and they hop over before touching anything. Its timers need the
 main run loop too; scheduled from an async start, the simulator's pulse
 never fired.
 */
@MainActor
final class WorkoutRecorder: NSObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
  static let shared = WorkoutRecorder()

  /// The spacing of the trace sent to the phone.
  static let intervalS = 5

  let healthStore = HKHealthStore()
  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?
  /// The workout being recorded, once known: a launch from the phone starts
  /// the session before the state naming the workout has arrived.
  private(set) var workoutId: String?
  private(set) var startDate: Date?
  private var readings: [(at: Date, bpm: Double)] = []
  /// A start in progress, so two callers cannot make two sessions.
  private var starting = false
  private(set) var activeKcal: Double = 0

  var onHeartRate: ((Int) -> Void)?
  var onEnergy: ((Double) -> Void)?

  private let defaults = UserDefaults.standard
  private let idKey = "RiceCalRecordingWorkout"
  private let startKey = "RiceCalRecordingStart"

  var isRecording: Bool { session != nil }

  private let heartRate = HKQuantityType(.heartRate)
  private let energy = HKQuantityType(.activeEnergyBurned)
  private let bpmUnit = HKUnit.count().unitDivided(by: .minute())

  // MARK: Permission

  func requestAuthorization() async -> Bool {
    guard HKHealthStore.isHealthDataAvailable() else { return false }
    do {
      try await healthStore.requestAuthorization(
        toShare: [HKObjectType.workoutType(), energy],
        read: [heartRate, energy, HKObjectType.workoutType()])
      let status = healthStore.authorizationStatus(for: HKObjectType.workoutType())
      NSLog("[RiceCalWatch] workout sharing authorization: \(status.rawValue)")
      return status == .sharingAuthorized
    } catch {
      NSLog("[RiceCalWatch] Health permission failed: \(error.localizedDescription)")
      return false
    }
  }

  // MARK: Recording

  /**
   Starts a session from `startDate`, which is the workout's own start when
   the phone began it a little while ago, so the saved workout spans the whole
   of it. Answers whether one is running.
   */
  func start(workoutId: String?, startDate: Date) async -> Bool {
    if session != nil {
      if let workoutId { attach(workoutId) }
      return true
    }
    guard !starting else { return false }
    starting = true
    defer { starting = false }
    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .traditionalStrengthTraining
    configuration.locationType = .indoor
    do {
      let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
      let builder = session.associatedWorkoutBuilder()
      builder.dataSource = HKLiveWorkoutDataSource(
        healthStore: healthStore, workoutConfiguration: configuration)
      session.delegate = self
      builder.delegate = self
      self.session = session
      self.builder = builder
      self.workoutId = workoutId
      readings = []
      activeKcal = 0

      let start = min(startDate, Date())
      session.startActivity(with: start)
      try await builder.beginCollection(at: start)
      self.startDate = start
      remember()
      tag()
      simulatePulse()
      return true
    } catch {
      // Most often Health access refused, which HealthKit answers by
      // discarding the builder the moment it begins.
      NSLog("[RiceCalWatch] could not start the workout session: \(error.localizedDescription)")
      session?.end()
      session = nil
      builder = nil
      self.workoutId = nil
      return false
    }
  }

  /// Names the workout being recorded, once the phone has said which it is.
  func attach(_ workoutId: String) {
    self.workoutId = workoutId
    remember()
    tag()
  }

  /**
   Puts the workout's id on the session as soon as it is known, not only at
   the finish: a session the system ends by itself (the app killed, the watch
   restarted) is saved with whatever it carries, and one saved without the key
   is read back by the phone as a second, unnamed workout.
   */
  private func tag() {
    guard let builder, let workoutId else { return }
    builder.addMetadata(["RiceCalWorkoutId": workoutId]) { _, error in
      if let error { NSLog("[RiceCalWatch] could not tag the workout: \(error.localizedDescription)") }
    }
  }

  /**
   Ends the session at `endDate`, saves the workout to Apple Health and
   answers the trace for the phone. Nil when there was no session, or nothing
   was read.
   */
  func finish(endDate: Date) async -> HeartTrace? {
    guard let session, let builder else { return nil }
    // A recovered session can come back without a start of its own; it is
    // still ended, or it would hold the recorder for every later workout.
    let startDate = self.startDate ?? builder.startDate ?? endDate
    let end = max(startDate.addingTimeInterval(1), min(endDate, Date()))
    let id = workoutId
    let live = readings
    let kcal = activeKcal
    // Free at once, so a second call while this one awaits finds nothing to
    // end, and a new workout can start its own session.
    clear()
    session.stopActivity(with: end)
    session.end()
    var healthId: String?
    do {
      try await builder.endCollection(at: end)
      if let id { try await builder.addMetadata(["RiceCalWorkoutId": id]) }  // in case it was named late
      let saved = try await builder.finishWorkout()
      healthId = saved?.uuid.uuidString
    } catch {
      NSLog("[RiceCalWatch] could not save the workout: \(error.localizedDescription)")
    }
    let stored = await storedReadings(from: startDate, to: end)
    guard let id else { return nil }
    // Whichever saw more: Health's own record survives this app being
    // relaunched mid-workout, the live readings survive a Health store that
    // has not caught up yet.
    let all = stored.count >= live.count ? stored : live
    let bpm = Self.buckets(all, from: startDate, to: end, intervalS: Self.intervalS)
    guard bpm.contains(where: { $0 != nil }) else { return nil }
    return HeartTrace(
      workoutId: id,
      startedAt: startDate.timeIntervalSince1970 * 1000,
      intervalS: Self.intervalS,
      bpm: bpm,
      activeKcal: kcal > 0 ? kcal : nil,
      healthWorkoutId: healthId)
  }

  /// Ends the session and keeps nothing: the workout was thrown away.
  func discard() {
    guard let session, let builder else { return }
    clear()
    session.end()
    builder.discardWorkout()
  }

  /// A session HealthKit kept while this app was relaunched.
  func recover() {
    healthStore.recoverActiveWorkoutSession { [weak self] session, error in
      guard let session else { return }
      Task { @MainActor in
        guard let self else { return }
        let builder = session.associatedWorkoutBuilder()
        session.delegate = self
        builder.delegate = self
        self.session = session
        self.builder = builder
        self.workoutId = self.defaults.string(forKey: self.idKey)
        let stored = self.defaults.double(forKey: self.startKey)
        self.startDate = stored > 0 ? Date(timeIntervalSince1970: stored) : builder.startDate
        self.simulatePulse()
      }
    }
  }

  private var pulseTimer: Timer?

  /**
   The watchOS simulator measures energy for a strength session but no heart
   rate at all, so nothing after the sensor could be tried there: not the
   reading on the wrist, the phone's logger, the trace or the chart. A
   simulator build feeds the session a made-up pulse instead, rising and
   falling the way sets and rests do. Compiled out of every device build.
   */
  private func simulatePulse() {
    #if targetEnvironment(simulator)
      pulseTimer?.invalidate()
      let began = Date()
      pulseTimer = Timer.scheduledTimer(withTimeInterval: Double(Self.intervalS), repeats: true) {
        [weak self] _ in
        Task { @MainActor in
          guard let self, self.session != nil else { return }
          let t = Date().timeIntervalSince(began)
          let bpm = 105 + 30 * sin(t / 45) + Double.random(in: -4...4)
          self.readings.append((at: Date(), bpm: bpm))
          self.onHeartRate?(Int(bpm.rounded()))
        }
      }
    #endif
  }

  private func remember() {
    defaults.set(workoutId, forKey: idKey)
    if let startDate { defaults.set(startDate.timeIntervalSince1970, forKey: startKey) }
  }

  private func clear() {
    pulseTimer?.invalidate()
    pulseTimer = nil
    session = nil
    builder = nil
    workoutId = nil
    startDate = nil
    readings = []
    activeKcal = 0
    defaults.removeObject(forKey: idKey)
    defaults.removeObject(forKey: startKey)
  }

  private func storedReadings(from start: Date, to end: Date) async -> [(at: Date, bpm: Double)] {
    let heartRate = self.heartRate
    let bpmUnit = self.bpmUnit
    return await withCheckedContinuation { continuation in
      let query = HKSampleQuery(
        sampleType: heartRate,
        predicate: HKQuery.predicateForSamples(withStart: start, end: end, options: []),
        limit: HKObjectQueryNoLimit,
        sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
      ) { _, samples, _ in
        let readings = (samples as? [HKQuantitySample] ?? []).map {
          (at: $0.startDate, bpm: $0.quantity.doubleValue(for: bpmUnit))
        }
        continuation.resume(returning: readings)
      }
      healthStore.execute(query)
    }
  }

  /**
   Readings to one figure every `intervalS` seconds from the start: the mean
   of those inside each step, nil where there were none. Evenly spaced, so the
   phone stores a list of numbers and not a time beside every one.
   */
  nonisolated static func buckets(
    _ readings: [(at: Date, bpm: Double)], from start: Date, to end: Date, intervalS: Int
  ) -> [Int?] {
    let count = max(1, Int((end.timeIntervalSince(start) / Double(intervalS)).rounded(.up)))
    var sums = [Double](repeating: 0, count: count)
    var counts = [Int](repeating: 0, count: count)
    for reading in readings {
      let index = Int(reading.at.timeIntervalSince(start) / Double(intervalS))
      guard index >= 0, index < count, reading.bpm >= 25, reading.bpm <= 250 else { continue }
      sums[index] += reading.bpm
      counts[index] += 1
    }
    return (0..<count).map { counts[$0] > 0 ? Int((sums[$0] / Double(counts[$0])).rounded()) : nil }
  }

  // MARK: Delegates

  nonisolated func workoutSession(
    _ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState,
    from fromState: HKWorkoutSessionState, date: Date
  ) {}

  nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    NSLog("[RiceCalWatch] workout session failed: \(error.localizedDescription)")
  }

  nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

  nonisolated func workoutBuilder(
    _ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>
  ) {
    let bpmUnit = HKUnit.count().unitDivided(by: .minute())
    for type in collectedTypes {
      guard let quantityType = type as? HKQuantityType,
        let statistics = workoutBuilder.statistics(for: quantityType)
      else { continue }
      if quantityType == HKQuantityType(.heartRate), let quantity = statistics.mostRecentQuantity() {
        let bpm = quantity.doubleValue(for: bpmUnit)
        let at = statistics.mostRecentQuantityDateInterval()?.start ?? Date()
        Task { @MainActor in
          if self.readings.last?.at != at { self.readings.append((at: at, bpm: bpm)) }
          self.onHeartRate?(Int(bpm.rounded()))
        }
      } else if quantityType == HKQuantityType(.activeEnergyBurned), let sum = statistics.sumQuantity() {
        let kcal = sum.doubleValue(for: .kilocalorie())
        Task { @MainActor in
          self.activeKcal = kcal
          self.onEnergy?(kcal)
        }
      }
    }
  }
}
