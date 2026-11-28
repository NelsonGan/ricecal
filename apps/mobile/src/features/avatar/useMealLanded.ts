import { useCallback, useEffect, useRef, useState } from 'react'

/** How recent a meal has to be to count as just eaten, not just loaded. */
const LANDED_MS = 2 * 60_000

/**
 * A meal arriving takes a few renders: an optimistic row, then the server's,
 * and a scan's placeholder resolving. One bite per arrival, not per id.
 */
const SETTLE_MS = 6000

type EntryLike = { id: string; loggedAt: string; status?: unknown }

/**
 * The id of the meal that has just landed on the day on screen, for the
 * avatar to eat. Ids already there when the day was first shown never count,
 * so opening the app, or paging to another day, plays nothing. `ready` means
 * the day's own rows have arrived: a baseline taken from an offline or failed
 * day is empty, and every recent meal would then look new.
 *
 * Worked out during the render that first shows the meal, not in an effect
 * after it: the day's totals change in that same render, and a render later
 * the avatar had already shown the new mood before taking the bite.
 */
export function useMealLanded(entries: readonly EntryLike[], day: string, ready: boolean) {
  const [landed, setLanded] = useState<string | null>(null)
  const seen = useRef<{ day: string; ids: Set<string> } | null>(null)
  const lastAt = useRef(0)
  // Kept here rather than in the card, which remounts behind a skeleton when
  // another day loads: a ref there forgot the bite and replayed it.
  const played = useRef<string | null>(null)

  const done = ready ? entries.filter((entry) => !entry.status) : []
  const baseline = !ready || seen.current === null || seen.current.day !== day
  const known = seen.current?.ids
  const fresh = baseline || !known ? [] : done.filter((entry) => !known.has(entry.id))
  const now = Date.now()
  const recent = fresh.filter((entry) => now - new Date(entry.loggedAt).getTime() < LANDED_MS)
  const last = recent.at(-1)?.id
  const candidate = last && last !== played.current ? last : undefined
  const settling = now - lastAt.current < SETTLE_MS

  useEffect(() => {
    if (!ready) return
    if (seen.current === null || seen.current.day !== day) {
      seen.current = { day, ids: new Set(done.map((entry) => entry.id)) }
      setLanded(null)
      return
    }
    for (const entry of done) seen.current.ids.add(entry.id)
    if (candidate && !settling) {
      lastAt.current = Date.now()
      setLanded(candidate)
    }
  })

  /** The card has started eating it: never offer this meal again. */
  const markPlayed = useCallback((id: string) => {
    played.current = id
    setLanded(null)
  }, [])
  const current = candidate && !settling ? candidate : landed
  return { landed: current !== played.current ? current : null, played: markPlayed }
}
