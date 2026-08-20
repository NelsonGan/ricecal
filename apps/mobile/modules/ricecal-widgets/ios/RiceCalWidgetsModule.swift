import ExpoModulesCore
import WidgetKit

/**
 The app's end of the App Group.

 Four calls, and every one of them is a few bytes into `UserDefaults`, so three
 of them are synchronous `Function`s rather than `AsyncFunction`s: the snapshot
 is written from a react-query subscription that fires whenever the day changes,
 and hopping to another queue and back would put the home screen a frame behind
 the diary for no benefit.

 `installedWidgetsAsync` is the exception because WidgetKit's own answer arrives
 on a completion handler.
 */
public class RiceCalWidgetsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RiceCalWidgets")

    Function("setSnapshot") { (json: String) in
      RiceCalWidgetStore.writeSnapshot(json)
      RiceCalWidgetStore.reloadAll()
    }

    Function("clearSnapshot") {
      RiceCalWidgetStore.clearSnapshot()
      RiceCalWidgetStore.reloadAll()
    }

    /**
     A no-op, and deliberately not left out of the module.

     Android needs telling which scheme a widget tap should use, because a
     widget there lives in a library that cannot read the app's own intent
     filters. Here the config plugin has already written the same value into
     the extension's Info.plist, which is strictly better: a widget with no
     snapshot on it still has to be able to open the app, and that can happen
     before JS has ever run on this install.

     Kept so the two platforms present the same module and the JS seam does not
     have to ask which one it is talking to.
     */
    Function("setScheme") { (_: String) in
    }

    Function("takePendingActions") { () -> String in
      RiceCalWidgetStore.takePendingActions()
    }

    AsyncFunction("installedWidgetsAsync") { (promise: Promise) in
      WidgetCenter.shared.getCurrentConfigurations { result in
        switch result {
        case .success(let widgets):
          /**
           One entry per PLACED widget, so the same kind twice is two rows.
           Reduced to a set of kinds here rather than in JS: what the adoption
           report asks is which widgets somebody uses, and two copies of the
           water widget is one answer to that, not two.
           */
          let kinds = Set(widgets.compactMap { RiceCalWidgetKind(rawValue: $0.kind)?.reported })
          promise.resolve(Array(kinds).sorted())
        case .failure:
          // Not an error worth raising. The service is unavailable on a
          // simulator running an OS that never had WidgetKit, and on a device
          // where the extension has not been registered yet — neither is
          // something the app can act on, and the JS side reads an empty list
          // as "none installed", which is true in both cases.
          promise.resolve([String]())
        }
      }
    }
  }
}
