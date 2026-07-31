import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

/**
 * Entries with a fix-by-typing correction in flight.
 *
 * The correction runs on the server for several seconds, and the user is sent
 * straight back to Today rather than being held on the detail screen — so the
 * row itself has to say "being reworked". Same shape as pending snaps and for
 * the same reason: the work outlives the screen that started it, so the ids
 * live here, above navigation, and `EntryList` swaps any row named in this
 * set for its progress state.
 *
 * In memory only. A refine interrupted by a force-quit simply shows the entry
 * as it was — the server either applied it or did not, and the next day fetch
 * tells the truth either way.
 */

type RefiningValue = {
  ids: string[]
  add: (entryId: string) => void
  remove: (entryId: string) => void
}

const RefiningContext = createContext<RefiningValue | null>(null)

export function RefiningProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([])

  const add = useCallback((entryId: string) => {
    setIds((current) => (current.includes(entryId) ? current : [...current, entryId]))
  }, [])

  const remove = useCallback((entryId: string) => {
    setIds((current) => current.filter((id) => id !== entryId))
  }, [])

  const value = useMemo(() => ({ ids, add, remove }), [ids, add, remove])

  return <RefiningContext.Provider value={value}>{children}</RefiningContext.Provider>
}

export function useRefiningEntries(): RefiningValue {
  const context = useContext(RefiningContext)
  if (!context) throw new Error('useRefiningEntries must be used inside <RefiningProvider>')
  return context
}
