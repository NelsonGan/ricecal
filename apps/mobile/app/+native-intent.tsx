/**
 * Links rewritten before the router sees them.
 *
 * One today: the workout's Live Activity, which links to `workout/resume`
 * rather than to the logger. With the app running, that is the logger, pushed
 * onto the stack the app already has. On a cold launch (iOS often kills the app
 * while the phone is locked between sets) it is the Workouts tab, which pushes
 * the logger once it has mounted: a link straight at `/workout/active` built a
 * stack holding the logger alone, so minimise went nowhere and the tabs layout,
 * which runs the rest timer, "still training?" and the activity itself, never
 * mounted.
 *
 * Every other link passes through untouched. A throw here crashes the app, so
 * anything unexpected passes through too.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    if (/(^|\/)workout\/resume(\?|$)/.test(path)) {
      return initial ? '/workouts?resume=1' : '/workout/active'
    }
  } catch {
    // Fall through to the path as it came.
  }
  return path
}
