import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

import type { MealPick, SuggestRequest } from '@/data'

/**
 * The picks currently on screen, and what was asked for to get them.
 *
 * IN MEMORY, ABOVE NAVIGATION, and nowhere else. A suggestion is not a record
 * of anything: it is a guess about a meal nobody has eaten, made against a
 * budget that changes with the next thing logged. Persisted, it would come back
 * a day later as a list of dishes that fitted somebody's Tuesday.
 *
 * It exists at all because the detail screen is a PUSHED PAGE and the list it
 * came from is a sheet. The picks have no id — there is no row, and inventing
 * one to put in a route segment would be inventing the thing this feature is
 * careful not to create — so the route carries an index and reads the pick from
 * here. Same shape as `RefiningProvider` and `PendingSnapsProvider`, and for
 * the same reason: the state outlives the screen that made it.
 *
 * `request` travels with them because the detail screen prints what was asked
 * for, and because "Try again" is the same question a second time.
 */

export type PicksValue = {
  picks: MealPick[]
  request: SuggestRequest | null
  set: (picks: MealPick[], request: SuggestRequest) => void
  clear: () => void
  /**
   * Bumped when a pick's page leaves, so the list it came from can come back.
   *
   * A COUNTER and not a flag, so two returns in a row are two events rather
   * than one that has to be cleared in between.
   *
   * It exists because focus cannot answer this. The list is opened from the log
   * sheet, which is a `transparentModal` — the screen under a transparent
   * presentation never loses focus, so a `useFocusEffect` on the way back never
   * fires and the list stayed closed after one pick was read. Unmounting is the
   * signal that actually happens, and it happens whichever way the page is left:
   * the chevron, the edge swipe, or Android's back button.
   */
  closed: number
  markClosed: () => void
}

const PicksContext = createContext<PicksValue | null>(null)

export function SuggestProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    picks: MealPick[]
    request: SuggestRequest | null
    closed: number
  }>({ picks: [], request: null, closed: 0 })

  // All three are `useCallback` with functional updates, so their identities
  // survive a state change. `markClosed` in particular is a dependency of the
  // effect that fires it on unmount, and a new identity per render would make
  // that effect run on every one of them.
  const set = useCallback(
    (picks: MealPick[], request: SuggestRequest) =>
      setState((current) => ({ ...current, picks, request })),
    [],
  )
  const clear = useCallback(
    () => setState((current) => ({ ...current, picks: [], request: null })),
    [],
  )
  const markClosed = useCallback(
    () => setState((current) => ({ ...current, closed: current.closed + 1 })),
    [],
  )

  const value = useMemo(
    (): PicksValue => ({
      picks: state.picks,
      request: state.request,
      closed: state.closed,
      set,
      clear,
      markClosed,
    }),
    [state, set, clear, markClosed],
  )

  return <PicksContext.Provider value={value}>{children}</PicksContext.Provider>
}

export function useSuggestedPicks(): PicksValue {
  const context = useContext(PicksContext)
  if (!context) throw new Error('useSuggestedPicks must be used inside <SuggestProvider>')
  return context
}
