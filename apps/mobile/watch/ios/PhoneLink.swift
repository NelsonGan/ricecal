import Foundation
import WatchConnectivity

/**
 The watch's end of WatchConnectivity.

 Each way, a slow path that always arrives and a fast one that arrives at
 once when it can. The phone's state and the watch's list of unconfirmed
 commands both go as the application context, which the system keeps, newest
 replacing the last, and hands over whenever the other app next runs, and as
 a message beside it while the other side is reachable. A heart rate trace
 goes by message, or by `transferUserInfo` when the phone is out of reach,
 which the system delivers even with both apps closed. Anything that arrives
 twice is applied once: commands are numbered, and a trace replaces itself.
 */
final class PhoneLink: NSObject, WCSessionDelegate {
  static let shared = PhoneLink()

  /// The latest state the phone sent, as JSON text.
  var onState: ((String) -> Void)?
  var onReachability: ((Bool) -> Void)?

  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    if session.delegate !== self { session.delegate = self }
    if session.activationState == .notActivated { session.activate() }
  }

  var isReachable: Bool {
    WCSession.isSupported() && WCSession.default.activationState == .activated
      && WCSession.default.isReachable
  }

  // MARK: To the phone

  /// Fires when the session is up or the phone comes back in reach, so what
  /// waited for it can go.
  var onReady: (() -> Void)?

  /**
   Every command the phone has not confirmed, as one list, in order. As the
   application context, which the system keeps, newest replacing the last, and
   hands to the phone app whenever it next runs; and as a message too while
   the phone is reachable, which arrives at once. Never one command at a time
   over two paths, which let a finish overtake the sets before it.
   */
  func sendPending(_ commands: [WatchCommand]) {
    guard WCSession.isSupported(), let json = Wire.encode(commands) else { return }
    let session = WCSession.default
    guard session.activationState == .activated else { return }
    do {
      try session.updateApplicationContext(["pending": json])
    } catch {
      NSLog("[RiceCalWatch] could not update the context: \(error.localizedDescription)")
    }
    if session.isReachable {
      session.sendMessage(["pending": json], replyHandler: { _ in }, errorHandler: nil)
    }
  }

  /**
   A message while the phone is reachable, so the workout page has its heart
   rate within seconds of the save. The first time a trace is sent it also
   goes in the queue when the phone is out of reach, which delivers it even
   with both apps closed; the store sends it again, by message, until the phone
   says it has it, so the queue is never given a second copy. The queue runs at
   background priority: on a simulator a trace sent only that way had still
   not arrived two minutes after the save.
   */
  func send(_ trace: HeartTrace, queueIfAway: Bool) {
    guard WCSession.isSupported(), let json = Wire.encode(trace) else { return }
    let session = WCSession.default
    let payload: [String: Any] = ["heart": json]
    if session.activationState == .activated, session.isReachable {
      session.sendMessage(
        payload, replyHandler: { _ in },
        errorHandler: { _ in if queueIfAway { session.transferUserInfo(payload) } })
    } else if queueIfAway {
      // Not reachable, or not active yet: the queue takes it either way.
      session.transferUserInfo(payload)
    }
  }

  /// A live reading, which is only worth sending while the phone can hear it.
  func sendPulse(workoutId: String, bpm: Int) {
    guard isReachable else { return }
    let pulse: [String: Any] = [
      "workoutId": workoutId, "bpm": bpm, "at": Date().timeIntervalSince1970 * 1000,
    ]
    WCSession.default.sendMessage(["pulse": pulse], replyHandler: nil, errorHandler: nil)
  }

  /// Asks the phone for its latest state, for a launch that has none yet.
  func askForState() {
    guard isReachable else { return }
    WCSession.default.sendMessage(
      ["wantsState": true],
      replyHandler: { [weak self] reply in
        if let state = reply["state"] as? String, !state.isEmpty { self?.onState?(state) }
      }, errorHandler: nil)
  }

  // MARK: From the phone

  func session(
    _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    if let state = session.receivedApplicationContext["state"] as? String { onState?(state) }
    askForState()
    onReady?()
  }

  func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
    if let state = context["state"] as? String { onState?(state) }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    if let state = message["state"] as? String { onState?(state) }
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    onReachability?(session.isReachable)
    if session.isReachable {
      askForState()
      onReady?()
    }
  }
}
