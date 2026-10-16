import Foundation
import HealthKit
import WatchConnectivity

/**
 The phone's end of WatchConnectivity.

 Activated at launch by `RiceCalWatchAppDelegate`, not when JS first asks for
 the module, because the watch can wake the app in the background: a command
 sent with `transferUserInfo` arrives at launch, before any JS has run, and has
 to be kept until JS can apply it. So everything the watch sends goes into an
 inbox in the app's own defaults, which JS drains with `takeInbox`, and a
 notification nudges the module to tell JS while it is running. The inbox is
 the record and the nudge only a hint, as with the Live Activity's buttons.

 The latest state JS published is kept in the defaults too, so a watch app
 that launches while the phone app is suspended, and asks for it, gets an
 answer without waiting on JS.

 Delegate calls arrive on a background queue; the lock covers the inbox, the
 only thing two of them can touch at once.
 */
final class RiceCalWatchLink: NSObject, WCSessionDelegate {
  static let shared = RiceCalWatchLink()

  static let inboxChanged = Notification.Name("RiceCalWatchInboxChanged")
  static let pulseReceived = Notification.Name("RiceCalWatchPulseReceived")
  static let statusChanged = Notification.Name("RiceCalWatchStatusChanged")

  private let lock = NSLock()
  private let defaults = UserDefaults.standard
  private let inboxKey = "RiceCalWatchInbox"
  private let stateKey = "RiceCalWatchState"
  private let heardKey = "RiceCalWatchHeard"
  private let healthStore = HKHealthStore()

  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    // The delegate has to be set before activating, and only once: the
    // module and the app delegate both call this.
    if session.delegate !== self { session.delegate = self }
    if session.activationState == .notActivated { session.activate() }
  }

  // MARK: Sending

  func publish(_ json: String) {
    defaults.set(json, forKey: stateKey)
    send(json)
  }

  private func send(_ json: String? = nil) {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated, session.isPaired,
      let state = json ?? defaults.string(forKey: stateKey)
    else { return }
    if session.isWatchAppInstalled || hasHeardFromWatch {
      do {
        // Kept by the system and handed to the watch app whenever it next
        // runs, the newest replacing the last.
        try session.updateApplicationContext(["state": state])
      } catch {
        NSLog("[RiceCalWatch] could not update the context: \(error.localizedDescription)")
      }
    }
    if session.isReachable {
      // At once, for a watch app on screen. A failure is fine: the context
      // above gets there too.
      session.sendMessage(["state": state], replyHandler: nil, errorHandler: nil)
    }
  }

  // MARK: Receiving

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    receive(message)
  }

  func session(
    _ session: WCSession, didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    if message["wantsState"] != nil {
      heard()
      replyHandler(["state": defaults.string(forKey: stateKey) ?? ""])
      return
    }
    receive(message)
    // The reply says the phone has it, kept, not that it was applied; the
    // state that follows says that.
    replyHandler(["ok": true])
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    receive(userInfo)
  }

  /**
   Whether the watch app has ever sent anything. `isWatchAppInstalled` lags
   behind an install from the Watch app, and stays false for a watch app put
   on a simulator directly, while a watch app that has spoken plainly exists.
   */
  private var hasHeardFromWatch: Bool { defaults.bool(forKey: heardKey) }

  private func heard() {
    guard !hasHeardFromWatch else { return }
    defaults.set(true, forKey: heardKey)
    NotificationCenter.default.post(name: Self.statusChanged, object: nil)
  }

  private func receive(_ payload: [String: Any]) {
    heard()
    if let pulse = payload["pulse"] as? [String: Any] {
      NotificationCenter.default.post(name: Self.pulseReceived, object: nil, userInfo: pulse)
      return
    }
    // Commands and traces arrive as JSON text, so nothing in between has to
    // agree with JS about property list types.
    var items: [String] = []
    if let command = payload["command"] as? String { items.append(#"{"kind":"command","command":\#(command)}"#) }
    if let trace = payload["heart"] as? String { items.append(#"{"kind":"heart","trace":\#(trace)}"#) }
    guard !items.isEmpty else { return }
    lock.lock()
    let inbox = (defaults.stringArray(forKey: inboxKey) ?? []) + items
    // A bound on a queue nobody drains, so it cannot grow without end. JS
    // drains it on every launch, so this is never reached in use.
    defaults.set(Array(inbox.suffix(500)), forKey: inboxKey)
    lock.unlock()
    NotificationCenter.default.post(name: Self.inboxChanged, object: nil)
  }

  /// The inbox as one JSON array, emptied.
  func takeInbox() -> String {
    lock.lock()
    let inbox = defaults.stringArray(forKey: inboxKey) ?? []
    defaults.removeObject(forKey: inboxKey)
    lock.unlock()
    return "[" + inbox.joined(separator: ",") + "]"
  }

  // MARK: State of the pairing

  func status() -> [String: Bool] {
    guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
      return ["paired": false, "installed": false, "reachable": false]
    }
    let session = WCSession.default
    return [
      "paired": session.isPaired,
      "installed": session.isPaired
        && (session.isWatchAppInstalled || session.isReachable || hasHeardFromWatch),
      "reachable": session.isReachable,
    ]
  }

  func session(
    _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    NotificationCenter.default.post(name: Self.statusChanged, object: nil)
    send()
  }

  func sessionWatchStateDidChange(_ session: WCSession) {
    NotificationCenter.default.post(name: Self.statusChanged, object: nil)
    send()
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    NotificationCenter.default.post(name: Self.statusChanged, object: nil)
    if session.isReachable { send() }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  /// Switching to another watch deactivates the session, and it has to be
  /// activated again for the new one.
  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  // MARK: Starting the watch's workout

  /**
   Launches the watch app, or wakes it, to record the running workout. The
   watch receives the configuration in `handle(_ workoutConfiguration:)` and
   learns which workout it is from the state.
   */
  func startWatchWorkout(_ done: @escaping (Bool) -> Void) {
    guard HKHealthStore.isHealthDataAvailable(), WCSession.isSupported(),
      WCSession.default.activationState == .activated, WCSession.default.isPaired
    else {
      done(false)
      return
    }
    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .traditionalStrengthTraining
    configuration.locationType = .indoor
    healthStore.startWatchApp(with: configuration) { started, error in
      if let error { NSLog("[RiceCalWatch] could not start the watch app: \(error.localizedDescription)") }
      done(started)
    }
  }
}
