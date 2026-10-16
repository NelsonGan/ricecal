import type { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { eachDayOfInterval, parseISO } from 'date-fns'

/**
 * Supabase returns errors in the payload rather than throwing, and react-query
 * decides everything — retry, the error state, whether the cache is stale —
 * from whether the query function threw. Unwrapping here is what connects the
 * two; without it a failed request resolves as `data: null` and the screen
 * renders an empty day instead of an error.
 */
/**
 * Three helpers rather than one, because PostgREST answers in three shapes and
 * a single generic collapses them: `data` is `T[]` for a plain select, `T` for
 * `.single()` and `T | null` for `.maybeSingle()`. One `unwrap` covering all
 * three infers `T` as the element type of a list and hands back a row where the
 * caller expects an array — which type-checks at the call site and explodes at
 * the first `.map`.
 */
export function unwrap<T>(result: PostgrestResponse<T>): T[] {
  if (result.error) throw result.error
  return result.data ?? []
}

/**
 * The same, for a request that must return exactly one row.
 *
 * `.single()` and `.select().single()` type their data as nullable because
 * PostgREST can answer with nothing. After an insert or an update that matched
 * by primary key, nothing means the write did not land — RLS refused it, or
 * the row is gone — and that has to be an error rather than a `null` handed to
 * a caller expecting a record.
 */
/**
 * For `.maybeSingle()`: no row is an answer, not a failure.
 *
 * Typed against `PostgrestSingleResponse` rather than the maybe-single alias
 * because the alias is itself `PostgrestSingleResponse<T | null>`, and
 * inferring `T` through that extra layer of union resolves to `never`.
 */
export function unwrapMaybe<T>(result: PostgrestSingleResponse<T>): T {
  if (result.error) throw result.error
  return result.data
}

export function unwrapOne<T>(result: PostgrestSingleResponse<T>): NonNullable<T> {
  if (result.error) throw result.error
  if (result.data === null || result.data === undefined) {
    throw new Error('Expected a row, got none')
  }
  return result.data as NonNullable<T>
}

/** `yyyy-MM-dd` for a date, in local time. `toISOString` shifts the day east of UTC. */
export function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Today, as the user's phone reckons it. */
export const today = () => dateKey(new Date())

/** Every `yyyy-MM-dd` from one date to another, inclusive. Empty if reversed. */
export function datesBetween(from: string, to: string): string[] {
  if (from > to) return []
  return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map(dateKey)
}

/**
 * Fills in cache entries that have none, and never touches one that has.
 *
 * How a range request warms the individual keys a screen reads: a day fetched
 * seven at a time still lives under `keys.day(user, date)`, so every
 * invalidation and optimistic update goes on working as it did.
 *
 * Only the empty ones, which is the whole safety argument: `setQueryData` over an
 * existing entry would land on a glass of water the user has just tapped, undoing
 * the optimistic update under their finger.
 */
export function seedMissing<T>(
  queryClient: QueryClient,
  entries: readonly (readonly [QueryKey, T])[],
): void {
  for (const [key, value] of entries) {
    if (queryClient.getQueryData(key) === undefined) queryClient.setQueryData(key, value)
  }
}

/** Rows asked for a page. The server may answer fewer, so a short page is not the end. */
const PAGE = 1000

/**
 * Every row of a select, a page at a time, until a page comes back empty.
 * Stopping on a short page instead read the end of the list wherever the
 * server's own row cap sat below the page size, and an installed app cannot
 * see that cap move.
 */
export async function everyRow<T>(
  page: (from: number, to: number) => PromiseLike<PostgrestResponse<T>>,
): Promise<T[]> {
  const rows: T[] = []
  for (;;) {
    const next = unwrap(await page(rows.length, rows.length + PAGE - 1))
    if (next.length === 0) return rows
    rows.push(...next)
  }
}

/** What `withDeadline` answers when the time ran out first. */
export const TIMED_OUT = Symbol('timed out')

/**
 * A promise's answer, or `TIMED_OUT` once `ms` have passed. For the whole of
 * an operation, not just its request: supabase-js refreshes an expired token
 * before it sends, with no signal and no timeout, and on Android a request
 * with none can wait forever, so an abort on the fetch alone bounded nothing.
 * The work itself carries on; only the wait for it ends.
 */
export function withDeadline<T>(work: PromiseLike<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms)
  })
  return Promise.race([Promise.resolve(work), deadline]).finally(() => clearTimeout(timer))
}
