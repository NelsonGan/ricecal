import HealthKit
import SwiftUI
import WatchKit

@main
struct RiceCalWatchApp: App {
  @WKApplicationDelegateAdaptor private var delegate: AppDelegate
  @StateObject private var store = WatchStore.shared

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(store)
        .tint(Palette.pandan)
    }
  }
}

final class AppDelegate: NSObject, WKApplicationDelegate {
  func applicationDidFinishLaunching() {
    Task { @MainActor in WatchStore.shared.launch() }
  }

  func applicationDidBecomeActive() {
    Task { @MainActor in WatchStore.shared.becameActive() }
  }

  /// The phone started a workout and asked HealthKit to launch this app for it.
  func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
    Task { @MainActor in WatchStore.shared.phoneAskedToRecord() }
  }

  /// HealthKit relaunched the app with a workout session still running.
  func handleActiveWorkoutRecovery() {
    Task { @MainActor in WorkoutRecorder.shared.recover() }
  }
}

/// What the app shows: the summary of a workout just finished here, the
/// workout running, or the routines to start one from.
struct RootView: View {
  @EnvironmentObject private var store: WatchStore

  var body: some View {
    if let summary = store.summary, store.workout?.id != summary.workoutId {
      SummaryView(summary: summary)
    } else if let workout = store.workout {
      WorkoutView(workout: workout)
    } else {
      StartView()
    }
  }
}
