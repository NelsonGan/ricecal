import ExpoModulesCore

/**
 JS's end of the watch. Everything is a few bytes through `RiceCalWatchLink`,
 so the calls are synchronous `Function`s except starting the watch's workout,
 which HealthKit answers on a completion handler.
 */
public class RiceCalWatchModule: Module {
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("RiceCalWatch")

    Events("onInbox", "onPulse", "onStatus")

    OnCreate {
      RiceCalWatchLink.shared.activate()
      self.observe()
    }

    OnDestroy {
      for observer in self.observers { NotificationCenter.default.removeObserver(observer) }
      self.observers = []
    }

    Function("publish") { (json: String) in
      RiceCalWatchLink.shared.publish(json)
    }

    Function("takeInbox") { () -> String in
      RiceCalWatchLink.shared.takeInbox()
    }

    Function("status") { () -> [String: Bool] in
      RiceCalWatchLink.shared.status()
    }

    AsyncFunction("startWatchWorkoutAsync") { (promise: Promise) in
      RiceCalWatchLink.shared.startWatchWorkout { started in promise.resolve(started) }
    }
  }

  /// Passes the link's notifications on to JS as events.
  private func observe() {
    let center = NotificationCenter.default
    observers = [
      center.addObserver(forName: RiceCalWatchLink.inboxChanged, object: nil, queue: .main) {
        [weak self] _ in
        self?.sendEvent("onInbox", [:])
      },
      center.addObserver(forName: RiceCalWatchLink.pulseReceived, object: nil, queue: .main) {
        [weak self] note in
        var pulse: [String: Any] = [:]
        for (key, value) in note.userInfo ?? [:] {
          if let key = key as? String { pulse[key] = value }
        }
        self?.sendEvent("onPulse", pulse)
      },
      center.addObserver(forName: RiceCalWatchLink.statusChanged, object: nil, queue: .main) {
        [weak self] _ in
        self?.sendEvent("onStatus", [:])
      },
    ]
  }
}
