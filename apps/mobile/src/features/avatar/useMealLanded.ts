import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * How long a meal that landed while Today was out of sight (behind the log
 * sheet, on another tab) still gets eaten when Today comes back.
 */
const LANDED_MS = 2 * 60_000

/**
 * A meal arriving takes a few renders: an optimistic row, then the server's,
 * and a scan's placeholder resolving. One bite per arrival, not per id.
 */
const SETTLE_MS = 6000

type EntryLike = { id: string; status?: unknown }

/**
 * The id of the meal that has just landed on the day on screen, for the
 * avatar to eat.
 *
 * "Just landed" means it arrived while this day was on screen: ids already
 * there when the day was first shown never count, so opening the app or
 * paging to another day plays nothing. It is not judged by the meal's own
 * time, which is the server's clock against the phone's (a phone a few
 * minutes fast never saw a meal as recent) and is whatever time the meal was
 * logged for (breakfast entered at noon is still eaten now).
 *
 * `ready` means the day's own rows have arrived: a baseline taken before
 * them is empty, and every row would then look new.
 *
 * Worked out during the render that first shows the meal, not in an effect
 * after it: the day's totals change in that same render, and a render later
 * the avatar had already shown the new mood before taking the bite.
 */
export function useMealLanded(entries: readonly EntryLike[], day: string, ready: boolean) {
  const [queued, setQueued] = useState<{ id: string; at: number } | null>(null)
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
  const last = fresh.at(-1)?.id
  const settling = now - lastAt.current < SETTLE_MS
  const candidate = last && last !== played.current && !settling ? last : undefined

  useEffect(() => {
    if (!ready) return
    if (seen.current === null || seen.current.day !== day) {
      seen.current = { day, ids: new Set(done.map((entry) => entry.id)) }
      setQueued(null)
      return
    }
    for (const entry of done) seen.current.ids.add(entry.id)
    if (candidate) {
      lastAt.current = Date.now()
      setQueued({ id: candidate, at: Date.now() })
    }
  })

  /** The card has started eating it: never offer this meal again. */
  const markPlayed = useCallback((id: string) => {
    played.current = id
    setQueued(null)
  }, [])

  // A bite still waiting is dropped once it is stale, or once the meal is gone
  // (deleted while Today was out of sight).
  const waiting =
    queued &&
    queued.id !== played.current &&
    now - queued.at < LANDED_MS &&
    done.some((entry) => entry.id === queued.id)
      ? queued.id
      : null

  return { landed: candidate ?? waiting, played: markPlayed }
}
