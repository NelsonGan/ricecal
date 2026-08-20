import AppIntents
import WidgetKit

/**
 The +250 and +500 buttons, which log a drink WITHOUT opening the app.

 That is the whole point of the water widget, and it is why it is the only one
 with an intent behind it. Every other widget's tap is "take me to the thing",
 which a URL does; a drink is a write, and a write that first launched an app,
 waited for a session and then made a request would be a button that does
 nothing for two seconds.

 So `perform` touches shared storage and returns. `RiceCalWidgetStore.addWater`
 queues the drink for the app to send and moves the figure on the card in the
 same breath, and WidgetKit reloads the timeline as soon as this resolves.

 iOS 17 and up. `Button(intent:)` does not exist below it, and the deployment
 target is 16.4 — see `WaterWidgetView` for what a 16.4 phone gets instead.
 */
@available(iOS 17.0, *)
struct AddWaterIntent: AppIntent {
  static var title: LocalizedStringResource = "Add water"
  static var description = IntentDescription("Adds a preset amount of water to today.")

  /**
   Not `openAppWhenRun`. The default is false and it has to stay false: this
   intent exists precisely so the app is not opened, and setting it would turn
   the quickest action in the whole app into the slowest.
   */
  @Parameter(title: "Millilitres")
  var millilitres: Int

  init() {}

  init(millilitres: Int) {
    self.millilitres = millilitres
  }

  func perform() async throws -> some IntentResult {
    /**
     The day is taken HERE, at the tap, rather than when the app drains the
     queue. A bottle finished at half past eleven belongs to that night, and the
     app might not be opened until the morning.
     */
    RiceCalWidgetStore.addWater(ml: millilitres, date: WidgetSnapshot.todayKey())
    return .result()
  }
}
