import { requireOptionalNativeModule } from 'expo'

import { WIDGET_KINDS, type WidgetAction, type WidgetKind, type WidgetSnapshot } from './src/types'

export type { WidgetAction, WidgetBar, WidgetEntry, WidgetKind, WidgetSnapshot } from './src/types'
export { WIDGET_KINDS } from './src/types'

/**
 * The seam between the app and the home screen.
 *
 * `requireOptionalNativeModule` rather than `requireNativeModule`, which is what
 * makes this file importable from a test: the strict form throws the moment it
 * cannot find the native side. Absent, every call is a no-op and
 * `installedWidgets` answers with an empty list.
 *
 * Two shipping cases find it absent or incomplete, which is why every call is
 * optional twice over (`native?.thing?.()`): a dev client built before this
 * module landed, and an over-the-air update, where `expo-updates` ships JS
 * without the binary under it. Guarding only the module turns the second into
 * "undefined is not a function" on the first render of the root layout.
 */
type Native = {
  setSnapshot?(json: string): void
  clearSnapshot?(): void
  setScheme?(scheme: string): void
  takePendingActions?(): string
  installedWidgetsAsync?(): Promise<string[]>
  startWorkoutActivity?(json: string): void
  updateWorkoutActivity?(json: string): void
  endWorkoutActivity?(): void
  takeWorkoutActions?(): string
  addListener?(event: 'onWorkoutAction', listener: () => void): { remove(): void }
}

const native = requireOptionalNativeModule<Native>('RiceCalWidgets')

/** Whether the home screen is reachable at all from this build. */
export const widgetsAvailable = native !== null

/**
 * Publish what the widgets should draw, and ask them to redraw.
 *
 * Serialised here rather than passing an object across the bridge, because the
 * native side only ever stores and forwards it: parsing a dictionary into Swift
 * and Kotlin types would be two more places for the shape to drift from
 * `WidgetSnapshot`.
 */
export function setWidgetSnapshot(snapshot: WidgetSnapshot): void {
  native?.setSnapshot?.(JSON.stringify(snapshot))
}

/**
 * Tell the widgets how to address the app.
 *
 * `ricecal://` for the store build and `ricecal-dev://` for a development
 * client, which are two different apps. Android needs telling: a widget lives
 * in a library module and cannot read the app's own intent filters, so until
 * this has been called a tap simply launches the app rather than landing on a
 * screen. iOS does not — the config plugin writes the same value into the
 * extension's Info.plist at prebuild, because a widget with no snapshot has to
 * be able to open the app before JS has ever run — so this is a no-op there.
 */
export function setWidgetScheme(scheme: string): void {
  native?.setScheme?.(scheme)
}

/**
 * Forget everything. Called on sign-out, and it is not optional: a widget is a
 * screenshot of somebody's day pinned to the home screen, and the next person
 * to sign in on this handset must not find it there.
 */
export function clearWidgetSnapshot(): void {
  native?.clearSnapshot?.()
}

/**
 * Drain the taps the widget could not send itself. The queue is emptied as it
 * is read, so whatever comes back here is the caller's to finish.
 *
 * NOT ATOMIC ACROSS PROCESSES, and it does not need to be. A drink pressed on
 * the home screen in the same instant as this read would be lost, and the
 * moment this runs is a foreground — which is a moment the widget is not being
 * tapped. The alternative is a queue that has to be acknowledged, and every
 * version of that ends with a drink logged twice on a phone killed mid-sync.
 *
 * Anything unrecognised is dropped rather than thrown on. The store outlives
 * the build that wrote it, so a queue left by a newer app can contain a kind
 * this one has never heard of.
 */
export function takePendingWidgetActions(): WidgetAction[] {
  const raw = native?.takePendingActions?.()
  if (!raw) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isWaterAction)
  } catch {
    return []
  }
}

function isWaterAction(value: unknown): value is WidgetAction {
  if (typeof value !== 'object' || value === null) return false
  const action = value as Record<string, unknown>
  return (
    action.type === 'water' &&
    typeof action.ml === 'number' &&
    Number.isFinite(action.ml) &&
    typeof action.date === 'string' &&
    typeof action.at === 'number'
  )
}

/**
 * Which widgets are actually on a home screen right now.
 *
 * The only way to learn this: neither platform announces an install, so the
 * answer is polled when the app comes forward and diffed against what was seen
 * last time. See `features/widgets/adoption.ts` for what that diff is for.
 *
 * A failure answers with an empty list rather than throwing. On iOS this call
 * goes through a system service that can simply not respond, and no report is
 * worth an unhandled rejection in a foreground handler.
 */
export async function installedWidgets(): Promise<WidgetKind[]> {
  if (!native) return []

  try {
    const kinds = (await native.installedWidgetsAsync?.()) ?? []
    return kinds.filter(isWidgetKind)
  } catch {
    return []
  }
}

const isWidgetKind = (value: string): value is WidgetKind =>
  (WIDGET_KINDS as readonly string[]).includes(value)

/**
 * A running workout, as its Live Activity shows it. Times are epoch
 * milliseconds; the lock screen counts the elapsed time and the rest itself
 * from them.
 */
export type WorkoutActivityState = {
  id: string
  name: string
  startedAt: number
  exercise: string
  /** "2/4": the next set of `exercise`, out of its sets. Empty when all are done. */
  set: string
  done: number
  total: number
  restEndsAt: number | null
  restTotalS: number | null
  /** The next set, which the activity's tick button names back to the app. */
  exerciseKey: string | null
  setId: string | null
  /** Whether that set has numbers to tick, so whether the tick is drawn. */
  canComplete: boolean
  /** The rest ticking it starts, which the activity shows the moment it is pressed. */
  restAfterS: number | null
  /** The "rest is over" notice, which a button that moves the rest rebooks itself. */
  restTitle: string
  restBody: string
  /** The same notice for the rest the tick would start, which names that set's exercise. */
  tickRestBody: string
  /** The buttons' names for VoiceOver. The extension has no strings of its own. */
  labels: { complete: string; less: string; more: string; skip: string }
}

/** A button pressed on the workout's Live Activity, queued for the app. */
export type WorkoutAction = {
  type: 'skipRest' | 'restMinus' | 'restPlus' | 'completeSet'
  workoutId: string
  exerciseKey: string
  setId: string
  /** When it was pressed, in epoch milliseconds. */
  at: number
}

/**
 * The lock screen and Dynamic Island while a workout runs. iOS only, and a
 * no-op everywhere else: on Android, on iOS before 16.2, and for a user who has
 * switched Live Activities off, where the workout simply is not on the lock
 * screen. Optional twice over for the reason every other call here is.
 */
export function startWorkoutActivity(state: WorkoutActivityState): void {
  native?.startWorkoutActivity?.(JSON.stringify(state))
}

export function updateWorkoutActivity(state: WorkoutActivityState): void {
  native?.updateWorkoutActivity?.(JSON.stringify(state))
}

export function endWorkoutActivity(): void {
  native?.endWorkoutActivity?.()
}

/**
 * The Live Activity buttons pressed since the last call, oldest first, and
 * the queue emptied. Anything unreadable is dropped rather than thrown on: a
 * lost tap is a nuisance, a crash on launch is not.
 */
export function takeWorkoutActions(): WorkoutAction[] {
  const raw = native?.takeWorkoutActions?.()
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is WorkoutAction =>
            typeof entry === 'object' &&
            entry !== null &&
            typeof entry.type === 'string' &&
            typeof entry.workoutId === 'string' &&
            typeof entry.at === 'number',
        )
      : []
  } catch {
    return []
  }
}

/** Called when a button has queued an action while the app is running. */
export function addWorkoutActionListener(listener: () => void): () => void {
  const subscription = native?.addListener?.('onWorkoutAction', listener)
  return () => subscription?.remove()
}
