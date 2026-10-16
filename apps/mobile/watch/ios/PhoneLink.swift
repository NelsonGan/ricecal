import Foundation
import WatchConnectivity

/**
 The watch's end of WatchConnectivity.

 Two directions, each with a slow path that always arrives and a fast one that
 arrives at once when it can:

   phone to watch   the application context, which the system keeps and hands
                    over whenever this app next runs, and a message beside it
                    while the phone is reachable
   watch to phone   a message with a reply while the phone is reachable, and
                    `transferUserInfo` otherwise, which the system queues and
                    delivers once it can, even with both apps closed

 A command whose message fails goes by `transferUserInfo` too. If the message
 did arrive and only its reply was lost, the phone sees it twice and applies it
 once, because every command carries an id.
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

  func send(_ command: WatchCommand) {
    guard let json = Wire.encode(command) else { return }
    deliver(["command": json])
  }

  /**
   A message while the phone is reachable, so the workout page has its heart
   rate within seconds of the save, and the queue otherwise. The queue runs at
   background priority: on a simulator a trace sent only that way had still
   not arrived two minutes after the save.
   */
  func send(_ trace: HeartTrace) {
    guard let json = Wire.encode(trace) else { return }
    deliver(["heart": json])
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

  private func deliver(_ payload: [String: Any]) {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated else {
      // Not yet active: the queue still takes it, and sends it when it is.
      session.transferUserInfo(payload)
      return
    }
    if session.isReachable {
      session.sendMessage(
        payload, replyHandler: { _ in },
        errorHandler: { _ in session.transferUserInfo(payload) })
    } else {
      session.transferUserInfo(payload)
    }
  }

  // MARK: From the phone

  func session(
    _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    if let state = session.receivedApplicationContext["state"] as? String { onState?(state) }
    askForState()
  }

  func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
    if let state = context["state"] as? String { onState?(state) }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    if let state = message["state"] as? String { onState?(state) }
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    onReachability?(session.isReachable)
    if session.isReachable { askForState() }
  }
}
