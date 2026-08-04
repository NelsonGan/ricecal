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
 * How a range request warms the individual keys a screen actually reads. A day
 * fetched seven at a time still lives under `keys.day(user, date)`, so every
 * mutation's invalidation and every optimistic update goes on working exactly
 * as it did — the range is a way of ARRIVING at those entries, not a second
 * place the day is kept.
 *
 * Only the empty ones, and that is the whole safety argument. `setQueryData`
 * over an existing entry would land on a glass of water the user has just
 * tapped and not yet had confirmed, with a figure read a moment before the tap;
 * the optimistic update would come undone under their finger. A key that
 * already holds something needs no warming anyway — it is exactly the case this
 * exists to produce.
 */
export function seedMissing<T>(
  queryClient: QueryClient,
  entries: readonly (readonly [QueryKey, T])[],
): void {
  for (const [key, value] of entries) {
    if (queryClient.getQueryData(key) === undefined) queryClient.setQueryData(key, value)
  }
}
