import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'

import type { MealPick, SuggestRequest } from '@/data'

/**
 * The five picks currently on screen, and what was asked for to get them.
 *
 * IN MEMORY, ABOVE NAVIGATION, and nowhere else. A suggestion is not a record
 * of anything: it is a guess about a meal nobody has eaten, made against a
 * budget that changes with the next thing logged. Persisted, it would come back
 * a day later as five dishes that fitted somebody's Tuesday.
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
}

const PicksContext = createContext<PicksValue | null>(null)

export function SuggestProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ picks: MealPick[]; request: SuggestRequest | null }>({
    picks: [],
    request: null,
  })

  const value = useMemo(
    (): PicksValue => ({
      picks: state.picks,
      request: state.request,
      set: (picks, request) => setState({ picks, request }),
      clear: () => setState({ picks: [], request: null }),
    }),
    [state],
  )

  return <PicksContext.Provider value={value}>{children}</PicksContext.Provider>
}

export function useSuggestedPicks(): PicksValue {
  const context = useContext(PicksContext)
  if (!context) throw new Error('useSuggestedPicks must be used inside <SuggestProvider>')
  return context
}
