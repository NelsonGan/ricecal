import {
  clearWidgetSnapshot,
  installedWidgets,
  setWidgetScheme,
  setWidgetSnapshot,
  takePendingWidgetActions,
} from '@modules/ricecal-widgets'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import {
  useActivityDay,
  useAddQueuedWater,
  useDay,
  useDayLog,
  useSelectedDate,
  useSession,
  useSettings,
  useTargets,
  useWeighIns,
} from '@/data'
import { track } from '@/lib/analytics'
import { sumMacros } from '@/lib/nutrition'
import { appScheme } from '@/lib/scheme'
import { unitFor } from '@/lib/units'
import { DEFAULT_WATER_ML } from '@/lib/water'
import { useTheme } from '@/theme/useTheme'
import { reportWidgets } from './adoption'
import { buildWidgetSnapshot } from './snapshot'

/**
 * Renderless. Keeps the home screen and the diary saying the same thing.
 *
 * A component rather than a call in the layout, for the reason `EntitlementSync`
 * is one: a hook in the root layout's body would sit above `SessionProvider`,
 * which this needs to read.
 *
 * Three jobs, together because all three are about the boundary between the app
 * and a process it does not control:
 *
 * 1. Publish today into the App Group whenever it changes.
 * 2. Send the drinks somebody logged on the water widget, which could not.
 * 3. Notice which widgets are on the home screen, since nothing announces it.
 */
export function WidgetSync() {
  const { userId } = useSession()

  /**
   * How a widget tap addresses this build, told once. Signed out as well as in,
   * because a widget showing the placeholder is still tappable and the answer is
   * a property of the build. Only Android acts on it.
   */
  useEffect(() => {
    setWidgetScheme(appScheme())
  }, [])

  /**
   * Signed out clears the store, and it is not a tidy-up: a widget is a
   * screenshot of somebody's day pinned to a home screen, and it survives an
   * account being signed out of.
   */
  useEffect(() => {
    if (!userId) clearWidgetSnapshot()
  }, [userId])

  // Every hook below this line needs a session — `useUserId` throws without
  // one — so the signed-out case is an early return rather than a guard inside
  // each of them.
  return userId ? <SignedInWidgetSync /> : null
}

function SignedInWidgetSync() {
  const { todayKey } = useSelectedDate()
  const { preference } = useTheme()

  /**
   * Today, not the selected day. Reading `selectedDate` would mean paging back
   * through the diary quietly rewrote the home screen, which the user would find
   * an hour later with no idea what changed it.
   */
  const day = useDayLog(todayKey)
  /**
   * Readiness comes from the query rather than the view above it. `useDayLog`
   * reports a day carrying an unresolved snap as settled, which is right for a
   * screen and wrong here: everything around the snap is still the empty-day
   * fallback, so publishing writes "nothing eaten today" onto a home screen.
   *
   * Not a second request: `useDayLog` reads this very query underneath, and
   * react-query keys on the query key.
   */
  const dayQuery = useDay(todayKey)
  const targets = useTargets()
  const activity = useActivityDay(todayKey)
  const settings = useSettings()
  const weighIns = useWeighIns()

  /**
   * The same rule Today draws by, so the two cannot disagree: movement extends
   * the budget unless the account turned that off, and it is active calories
   * rather than the whole burn, because the goal already contains basal
   * metabolism.
   */
  const burned =
    settings.data?.activity_extends_budget === false ? 0 : (activity.data?.activeKcal ?? 0)

  /**
   * Whether there is an answer worth publishing yet. A pending query has no data,
   * and every value below falls back to a confident statement, which published is
   * a home screen announcing that somebody has eaten nothing today.
   *
   * `isPaused` is the other half: offline with nothing cached, `isPending` stays
   * true indefinitely, and the widget keeps what it had. Paired per query rather
   * than or-ed, for the reason written out on Today.
   */
  const ready =
    settled(dayQuery.isPending, dayQuery.isPaused) &&
    settled(targets.isPending, targets.isPaused) &&
    settled(settings.isPending, settings.isPaused) &&
    settled(activity.isPending, activity.isPaused) &&
    settled(weighIns.isPending, weighIns.isPaused)

  const snapshot = useMemo(() => {
    if (!ready) return null

    return buildWidgetSnapshot({
      date: todayKey,
      theme: preference,
      targets: targets.data ?? null,
      eaten: sumMacros(day.entries.filter((entry) => !entry.status)),
      burned,
      waterMl: day.waterMl,
      waterGoalMl: targets.data?.waterMl ?? DEFAULT_WATER_ML,
      // A snap still being recognised has no calories yet, so it is left off
      // rather than drawn as a meal worth nothing. It arrives as itself the
      // moment the cascade answers, and the widget redraws then.
      entries: day.entries
        .filter((entry) => !entry.status)
        .map((entry) => ({ name: entry.foodName, kcal: entry.macros.kcal })),
      weighIns: weighIns.data ?? [],
      unit: unitFor(settings.data?.units),
      now: Date.now(),
    })
  }, [ready, todayKey, preference, targets.data, day, burned, weighIns.data, settings.data])

  /**
   * Published only when it actually changed. Every write crosses into another
   * process and asks WidgetKit to redraw, and this effect's inputs include the
   * whole day, which is a new array identity on every refetch.
   *
   * Compared as JSON rather than field by field, because `updatedAt` is the one
   * field that always differs and the one nothing draws.
   */
  const published = useRef<string | null>(null)
  useEffect(() => {
    if (!snapshot) return
    const { updatedAt: _updatedAt, ...rest } = snapshot
    const signature = JSON.stringify(rest)
    if (published.current === signature) return
    published.current = signature
    setWidgetSnapshot(snapshot)
  }, [snapshot])

  useWidgetForeground()

  return null
}

/** A query with an answer, or one that will not get one until the phone is back. */
const settled = (isPending: boolean, isPaused: boolean) => !isPending || isPaused

/**
 * What happens when the app comes forward: drain the queue, then look at the home
 * screen. Foreground rather than a timer, because both can only change while the
 * app is not running.
 */
function useWidgetForeground() {
  // The mutation's own function rather than the object around it. React Query
  // returns a fresh result object on every render and a stable `mutateAsync`,
  // so depending on the object would rebuild the callback below on every render
  // and re-subscribe the AppState listener with it.
  const { mutateAsync: addWater } = useAddQueuedWater()

  const sync = useCallback(async () => {
    /**
     * The drinks first. `takePendingWidgetActions` empties the queue as it reads
     * it, so a failure loses the drink. The alternative is a queue that has to be
     * acknowledged, and every version of that logs a drink twice on a phone
     * killed mid-sync.
     */
    for (const action of takePendingWidgetActions()) {
      try {
        await addWater({ ml: action.ml, date: action.date })
        // Tracked on the SYNC rather than on the tap, because the tap happens
        // where there is no Mixpanel. So this is late by however long it took
        // somebody to open the app, and a drink that failed above is never
        // counted — which is the honest direction to be wrong in.
        track('Widget Water Added', { preset: action.ml })
      } catch {
        // Nothing to say to the user: they pressed this on a home screen
        // possibly hours ago and are not looking at a water tank now. The
        // failure is the request's, and Sentry has the ones worth seeing.
      }
    }

    reportWidgets(await installedWidgets())
  }, [addWater])

  useEffect(() => {
    // Once on mount as well as on every foreground. A cold launch IS the app
    // coming forward, and it is the launch a widget tap produces — which is
    // exactly when there is most likely to be something queued.
    void sync()

    const listener = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void sync()
    })

    return () => listener.remove()
  }, [sync])
}
