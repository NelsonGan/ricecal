import SwiftUI
import WidgetKit

/**
 The extension's entry point, and the whole of what it publishes.

 Six widgets, one job each, which is the rule the design document states and the
 reason there is no configurable "pick what to show" widget here: a widget that
 asks a question before it can answer one is a settings screen on a home screen.
 */
@main
struct RiceCalWidgetBundle: WidgetBundle {
  var body: some Widget {
    KcalWidget()
    WaterWidget()
    WeightWidget()
    DayWidget()
    QuickLogWidget()
    TodayWidget()
  }
}
