import Foundation

/*
 What crosses between the watch and the phone. The TypeScript half is
 `modules/ricecal-watch/src/types.ts`, and the two have to agree field for
 field.

 Every field is decoded leniently, with a default when it is missing: the
 watch app and the phone app are updated separately, and either may be talking
 to an older build of the other.
 */

extension KeyedDecodingContainer {
  fileprivate func value<T: Decodable>(_ key: Key, _ fallback: T) -> T {
    (try? decodeIfPresent(T.self, forKey: key)) ?? fallback
  }
}

/// A set's figures, in kilograms, seconds and metres.
struct Figures: Codable, Equatable {
  var weightKg: Double?
  var reps: Double?
  var durationS: Double?
  var distanceM: Double?
}

struct WatchSet: Codable, Equatable, Identifiable {
  var id: String
  var kind: String
  var done: Bool
  var weightKg: Double?
  var reps: Double?
  var durationS: Double?
  var distanceM: Double?
  /// Seconds of rest completing it starts; 0 inside a superset round.
  var restS: Double
  /// A routine's own figures, before last time's were offered. Only on routines.
  var plan: Figures?

  var figures: Figures {
    get { Figures(weightKg: weightKg, reps: reps, durationS: durationS, distanceM: distanceM) }
    set {
      weightKg = newValue.weightKg
      reps = newValue.reps
      durationS = newValue.durationS
      distanceM = newValue.distanceM
    }
  }

  init(
    id: String, kind: String, done: Bool, figures: Figures, restS: Double, plan: Figures? = nil
  ) {
    self.id = id
    self.kind = kind
    self.done = done
    self.weightKg = figures.weightKg
    self.reps = figures.reps
    self.durationS = figures.durationS
    self.distanceM = figures.distanceM
    self.restS = restS
    self.plan = plan
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    kind = c.value(.kind, "normal")
    done = c.value(.done, false)
    weightKg = c.value(.weightKg, nil)
    reps = c.value(.reps, nil)
    durationS = c.value(.durationS, nil)
    distanceM = c.value(.distanceM, nil)
    restS = c.value(.restS, 0)
    plan = c.value(.plan, nil)
  }
}

struct WatchExercise: Codable, Equatable, Identifiable {
  var key: String
  var exerciseId: String
  var name: String
  var tracking: String
  var superset: Int?
  var ownRestS: Double?
  var sets: [WatchSet]

  var id: String { key }

  init(
    key: String, exerciseId: String, name: String, tracking: String, superset: Int?,
    ownRestS: Double?, sets: [WatchSet]
  ) {
    self.key = key
    self.exerciseId = exerciseId
    self.name = name
    self.tracking = tracking
    self.superset = superset
    self.ownRestS = ownRestS
    self.sets = sets
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    key = try c.decode(String.self, forKey: .key)
    exerciseId = c.value(.exerciseId, "")
    name = c.value(.name, "")
    tracking = c.value(.tracking, "weight_reps")
    superset = c.value(.superset, nil)
    ownRestS = c.value(.ownRestS, nil)
    sets = c.value(.sets, [])
  }
}

struct WatchRest: Codable, Equatable {
  /// Epoch milliseconds.
  var endsAt: Double
  var totalS: Double
}

struct WatchWorkout: Codable, Equatable {
  var id: String
  var name: String
  /// Epoch milliseconds.
  var startedAt: Double
  var rest: WatchRest?
  var recorded: Bool
  var applied: [String]
  var exercises: [WatchExercise]

  init(
    id: String, name: String, startedAt: Double, rest: WatchRest?, recorded: Bool,
    applied: [String], exercises: [WatchExercise]
  ) {
    self.id = id
    self.name = name
    self.startedAt = startedAt
    self.rest = rest
    self.recorded = recorded
    self.applied = applied
    self.exercises = exercises
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    name = c.value(.name, "")
    startedAt = c.value(.startedAt, Date().timeIntervalSince1970 * 1000)
    rest = c.value(.rest, nil)
    recorded = c.value(.recorded, false)
    applied = c.value(.applied, [])
    exercises = c.value(.exercises, [])
  }
}

struct WatchRoutine: Codable, Equatable, Identifiable {
  var id: String
  var name: String
  var exercises: [WatchExercise]

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    name = c.value(.name, "")
    exercises = c.value(.exercises, [])
  }
}

struct WatchEnded: Codable, Equatable {
  var id: String
  var saved: Bool
  var at: Double
}

struct WatchState: Codable, Equatable {
  var v: Int
  var rev: Double
  var signedIn: Bool
  var unit: String
  var distanceUnit: String
  var workout: WatchWorkout?
  var ended: [WatchEnded]
  var routines: [WatchRoutine]
  var labels: [String: String]

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    v = c.value(.v, 1)
    rev = c.value(.rev, 0)
    signedIn = c.value(.signedIn, false)
    unit = c.value(.unit, "kg")
    distanceUnit = c.value(.distanceUnit, "km")
    workout = c.value(.workout, nil)
    ended = c.value(.ended, [])
    routines = c.value(.routines, [])
    labels = c.value(.labels, [:])
  }
}

/// A set of a workout started here: the routine's own figures for the phone,
/// and what the watch shows until the phone's copy arrives, which the phone
/// does not read.
struct StartSet: Codable, Equatable {
  var id: String
  var kind: String
  var weightKg: Double?
  var reps: Double?
  var durationS: Double?
  var distanceM: Double?
  var shown: Figures?
  var restS: Double?
}

struct StartExercise: Codable, Equatable {
  var key: String
  var exerciseId: String
  var name: String
  var tracking: String
  var restS: Double?
  var superset: Int?
  var sets: [StartSet]
}

/**
 A press on the watch, for the phone to apply. One flat type with the fields of
 every kind optional, rather than an enum, so it encodes to exactly the JSON
 the phone's `WatchCommand` union reads.
 */
struct WatchCommand: Codable, Equatable, Identifiable {
  var id: String = UUID().uuidString.lowercased()
  var workoutId: String
  /// Epoch milliseconds of the press.
  var at: Double = Date().timeIntervalSince1970 * 1000
  var type: String

  var routineId: String?
  var name: String?
  var exercises: [StartExercise]?
  var exerciseKey: String?
  var setId: String?
  var weightKg: Double?
  var reps: Double?
  var durationS: Double?
  var distanceM: Double?
  var restS: Double?
  var byS: Double?
  var endedAt: Double?
}

/// The heart rate the watch recorded, sent once its session has ended.
struct HeartTrace: Codable, Equatable {
  var workoutId: String
  /// Epoch milliseconds of the first reading.
  var startedAt: Double
  var intervalS: Int
  var bpm: [Int?]
  var activeKcal: Double?
  var healthWorkoutId: String?
}

enum Wire {
  static func encode<T: Encodable>(_ value: T) -> String? {
    guard let data = try? JSONEncoder().encode(value) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  static func decode<T: Decodable>(_ type: T.Type, _ text: String) -> T? {
    guard let data = text.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(type, from: data)
  }
}
