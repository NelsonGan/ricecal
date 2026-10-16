import ExpoModulesCore

/**
 Activates the watch session as the app launches. The watch can be what
 launched it, in the background, with a command waiting to be delivered, and
 the session has to have its delegate by the end of launch to receive it.
 */
public class RiceCalWatchAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    RiceCalWatchLink.shared.activate()
    return true
  }
}
