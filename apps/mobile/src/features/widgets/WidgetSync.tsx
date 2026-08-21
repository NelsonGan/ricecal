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
 * beside it is one: the root layout is a stack of providers and a hook in its
 * body would sit above `SessionProvider`, which is the thing this needs to read.
 *
 * Three jobs, and they are here together because all three are about the same
 * boundary between the app and a process it does not control:
 *
 * 1. Publish today into the App Group whenever it changes.
 * 2. Send the drinks somebody logged on the water widget, which could not.
 * 3. Notice which widgets are on the home screen, since nothing announces it.
 */
export function WidgetSync() {
  const { userId } = useSession()

  /**
   * How a widget tap addresses this build, told once.
   *
   * Signed out as well as in, and before anything else here: a widget showing
   * the placeholder is still tappable, and the answer is a property of the
   * build rather than of the account. Only Android acts on it — see
   * `setWidgetScheme`.
   */
  useEffect(() => {
    setWidgetScheme(appScheme())
  }, [])

  /**
   * Signed out clears the store, and it is not a tidy-up.
   *
   * A widget is a screenshot of somebody's day pinned to a home screen. It
   * survives the app being closed and it survives an account being signed out
   * of, so without this the next person to sign in on a shared handset would
   * find the last one's calories, weight and meals still sitting there.
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
   * TODAY, not the selected day.
   *
   * The strip can put last Tuesday on screen, and a widget is not showing last
   * Tuesday. Reading `selectedDate` here would mean that paging back through
   * the diary quietly rewrote the home screen, and the user would find it there
   * an hour later with no idea what changed it.
   */
  const day = useDayLog(todayKey)
  /**
   * READINESS COMES FROM THE QUERY, not from the view above it.
   *
   * `useDayLog` reports a day carrying an unresolved snap as settled however
   * the request is doing, and that is right for a SCREEN: the photograph is
   * content, and Today hiding behind a skeleton would take it off the day it
   * was just added to. It is wrong here. Everything around the snap is still
   * the empty-day fallback at that point, so publishing it writes "nothing
   * eaten today" onto a home screen for as long as the request takes, on the
   * one kind of launch where somebody has just logged something.
   *
   * Not a second request: `useDayLog` is reading this very query underneath,
   * and react-query keys on the query key, so the two share one cache entry
   * and one fetch in flight.
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
   * Whether there is an answer worth publishing yet.
   *
   * A query that is pending has no data, and every value below reads through a
   * fallback that turns that into a confident statement — a full budget
   * remaining, an empty tank, no meals. Published, that is a home screen
   * announcing that somebody has eaten nothing today, on a day they have eaten
   * three meals, until the requests land.
   *
   * `isPaused` is the other half. Offline with nothing cached a query is held
   * rather than sent, so `isPending` stays true indefinitely and a wait that
   * cannot end is not a wait: the widget keeps whatever it already had, which
   * is the right answer for a phone with no signal. Paired per query rather
   * than or-ed across all of them, for the reason written out on Today.
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
   * Published only when it actually changed.
   *
   * Every write crosses into another process and asks WidgetKit (or the
   * `AppWidgetManager`) to redraw. This effect's inputs include the whole day,
   * which is a new array identity on every refetch — most of which return
   * exactly what was already there — so without the comparison a diary left
   * open would repaint the home screen every time a query refocused.
   *
   * Compared as JSON rather than field by field, because `updatedAt` is the one
   * field that always differs and is the one nothing draws.
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
 * What happens when the app comes forward: drain the queue, then look at the
 * home screen.
 *
 * Foreground rather than a timer, because both of these can only change while
 * the app is NOT running. A widget is added in the OS and a preset is pressed
 * in a process of its own, so the only interesting moment is the one where the
 * app finds out what happened while it was away.
 */
function useWidgetForeground() {
  // The mutation's own function rather than the object around it. React Query
  // returns a fresh result object on every render and a stable `mutateAsync`,
  // so depending on the object would rebuild the callback below on every render
  // and re-subscribe the AppState listener with it.
  const { mutateAsync: addWater } = useAddQueuedWater()

  const sync = useCallback(async () => {
    /**
     * The drinks first.
     *
     * `takePendingWidgetActions` empties the queue as it reads it, so a failure
     * here loses the drink. That is the accepted trade rather than an oversight:
     * the alternative is a queue that has to be acknowledged, and every version
     * of that ends with a drink being logged twice on a phone that was killed
     * mid-sync. Water is the cheapest thing in the app to lose, and doubling one
     * is worse than dropping one.
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
