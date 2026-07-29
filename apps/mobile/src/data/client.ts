import type { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js'

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
