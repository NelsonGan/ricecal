/**
 * The home screen.
 *
 * `snapshot.ts` decides what the widgets say, `adoption.ts` works out which of
 * them anybody actually keeps, and `WidgetSync` is the one thing mounted in the
 * app. The native halves are in `modules/ricecal-widgets` (the App Group and the
 * Android widgets) and `widgets/ios` (the WidgetKit extension).
 */
export { diffWidgets, forgetWidgetsForTest, reportWidgets, type WidgetDiff } from './adoption'
export { buildWidgetSnapshot, type SnapshotInput } from './snapshot'
export { WidgetSync } from './WidgetSync'
