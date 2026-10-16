import SwiftUI

/**
 The watch's own words, in English, for before the phone has sent its own in
 the user's language (`watchLabels` in `features/workouts/WatchSync.tsx`). The
 keys are the phone's, and the phone's word wins wherever it has one.
 */
enum Labels {
  static let english: [String: String] = [
    "start": "Start",
    "routines": "My routines",
    "noRoutines": "Make a routine on your iPhone to start it here.",
    "openPhone": "Open RiceCal on your iPhone to begin.",
    "set": "Set",
    "reps": "Reps",
    "time": "Time",
    "weightUnit": "kg",
    "distanceUnit": "km",
    "warmup": "W",
    "drop": "D",
    "failure": "F",
    "completeSet": "Complete set",
    "rest": "Rest",
    "skip": "Skip",
    "restMinus": "−15 s",
    "restPlus": "+15 s",
    "exercises": "Exercises",
    "addSet": "Add set",
    "undo": "Undo",
    "end": "End workout",
    "endTitle": "End this workout?",
    "save": "Save workout",
    "discard": "Discard workout",
    "cancel": "Cancel",
    "nothingTitle": "Nothing to save yet",
    "saved": "Workout saved",
    "allDone": "All sets done",
    "upNext": "Up next",
    "empty": "Add exercises on your iPhone.",
    "syncing": "Syncs when your iPhone is near",
    "previousSet": "Previous set",
    "nextSet": "Next set",
    "heartRate": "Heart rate",
    "bpm": "bpm",
    "kcal": "kcal",
    "duration": "Duration",
    "sets": "Sets",
    "done": "Done",
  ]
}

/// The app's colours, from its dark palette: the watch is always dark.
enum Palette {
  static let pandan = Color(red: 0x38 / 255, green: 0xD0 / 255, blue: 0x7E / 255)
  static let pandanSoft = Color(red: 0x14 / 255, green: 0x29 / 255, blue: 0x1F / 255)
  static let hibiscus = Color(red: 0xFF / 255, green: 0x6B / 255, blue: 0x87 / 255)
  static let kaya = Color(red: 0xFF / 255, green: 0xCE / 255, blue: 0x5E / 255)
  static let water = Color(red: 0x63 / 255, green: 0xD3 / 255, blue: 0xF2 / 255)
  static let surface = Color(red: 0x1A / 255, green: 0x22 / 255, blue: 0x20 / 255)
  static let line = Color(red: 0x2E / 255, green: 0x39 / 255, blue: 0x36 / 255)
  static let muted = Color(red: 0x8B / 255, green: 0x9A / 255, blue: 0x94 / 255)
  /// Ink on a pandan button, which is bright in the dark palette.
  static let onPandan = Color(red: 0x0C / 255, green: 0x13 / 255, blue: 0x10 / 255)
}

/// How figures read on the watch, in the unit the phone says the user reads.
enum Format {
  static let lbPerKg = 2.20462262185
  static let mPerMi = 1609.344

  static func weight(_ kg: Double?, unit: String) -> String {
    guard let kg else { return "—" }
    return trim(unit == "lb" ? kg * lbPerKg : kg)
  }

  static func distance(_ metres: Double?, unit: String) -> String {
    guard let metres else { return "—" }
    return trim(unit == "mi" ? metres / mPerMi : metres / 1000)
  }

  static func clock(_ seconds: Double) -> String {
    let total = max(0, Int(seconds.rounded(.down)))
    let hours = total / 3600
    let minutes = (total % 3600) / 60
    let secs = total % 60
    return hours > 0
      ? String(format: "%d:%02d:%02d", hours, minutes, secs)
      : String(format: "%d:%02d", minutes, secs)
  }

  /// At most two places, and none that are zero: 60, 62.5, 61.23.
  static func trim(_ value: Double) -> String {
    let rounded = (value * 100).rounded() / 100
    if rounded == rounded.rounded() { return String(Int(rounded)) }
    return String(format: "%g", rounded)
  }
}
