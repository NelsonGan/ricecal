import { useMutation, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { keys } from './keys'
import { refusalFrom } from './refusals'
import { useUserId } from './session'
import type { IconRef, Meal } from './types'

/**
 * "What should I eat?", answered by the model.
 *
 * A MUTATION AND NOT A QUERY, which is the one decision here worth explaining.
 * Everything about it looks like a read — nothing is written, and the same
 * request twice would be a fair thing to cache — but a query is a thing
 * react-query is entitled to RE-RUN: on focus, on reconnect, on a stale timer.
 * Each of those is a model call, a scan off the user's daily allowance, and a
 * different five dishes appearing under a finger. The user presses a button and
 * gets an answer; that is a mutation whatever the verb.
 *
 * What it costs is that the answer has nowhere to live, which is what
 * `SuggestProvider` in `features/suggest` is for.
 */

// `Meal` is the `public.meal` enum and is already declared in `types.ts`, off
// the generated database types. Re-declaring it here would be a second spelling
// of a four-value union that Postgres owns.
export type Focus = 'protein' | 'balanced' | 'carbs'
export type Cuisine = 'malay' | 'mamak' | 'chinese' | 'others'
export type Sodium = 'low' | 'medium' | 'high'
export type ReasonKind = 'protein' | 'carbs' | 'fat' | 'calories' | 'taste'

export type SuggestRequest = {
  meal: Meal
  focus: Focus
  cuisine: Cuisine
  /**
   * Lean towards the lighter of two dishes that both fit.
   *
   * A tie-break rather than a filter — the server refuses to answer with diet
   * food either way. See the note on `DayContext.healthy`.
   */
  healthy: boolean
  /** The ceiling the user set, in kcal. */
  kcalLimit: number
  /** The day it is about. The selected date, which is usually today. */
  date: string
}

export type Reason = { kind: ReasonKind; text: string }

/**
 * One dish the model suggested.
 *
 * `MealPick` rather than `Pick`, which is what the server calls it: this type
 * is exported from the `@/data` barrel, and a type called `Pick` there shadows
 * TypeScript's own `Pick<T, K>` in every file that imports it. The failure is
 * "Expected 1 type arguments, but got 2" in a file whose author has no reason
 * to suspect the barrel.
 *
 * NOT an `Entry` and not a `Food`, deliberately, even though it carries the
 * same four macros. Nothing here has an id, because there is no row: it is a
 * guess about a meal nobody has eaten, and giving it the shape of a catalogue
 * food is the first step towards something logging it as one.
 */
export type MealPick = {
  name: string
  /** "one bowl", "a plate". What the figures are for. */
  portion: string
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  sodium: Sodium
  icon?: IconRef
  /** Why this one, given the day. Never empty — the server drops those. */
  why: Reason[]
}

type PickRow = {
  name?: string
  portion?: string
  kcal?: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
  sodium?: Sodium
  icon?: { set?: string; name?: string } | null
  why?: Reason[]
}

/**
 * Five things to eat, or an empty list.
 *
 * Empty is a real answer rather than a failure: the endpoint returns it when
 * the model would not answer in the shape asked for, and the sheet says "we
 * could not think of anything" and offers the button again. A THROWN error is
 * the other case — the request did not arrive, or was refused — and the caller
 * tells those apart because only one of them has a paywall behind it.
 */
export function useSuggestMeals() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (request: SuggestRequest): Promise<MealPick[]> => {
      const { data, error } = await supabase.functions.invoke('suggest-meal', {
        body: {
          meal: request.meal,
          focus: request.focus,
          cuisine: request.cuisine,
          healthy: request.healthy,
          kcal_limit: Math.round(request.kcalLimit),
          date: request.date,
        },
      })
      if (error) {
        // A refusal is thrown as itself so the caller can open the paywall.
        // Everything else is thrown as it arrived.
        throw (await refusalFrom(error)) ?? error
      }

      const rows = ((data as { picks?: PickRow[] })?.picks ?? []).filter(
        (row) => typeof row.name === 'string' && row.name.length > 0,
      )

      return rows.map((row) => ({
        name: row.name as string,
        portion: row.portion ?? '',
        kcal: Math.round(row.kcal ?? 0),
        proteinG: Math.round(row.protein_g ?? 0),
        carbsG: Math.round(row.carbs_g ?? 0),
        fatG: Math.round(row.fat_g ?? 0),
        sodium: row.sodium ?? 'medium',
        // The server has already checked the name against the icon registry —
        // see `resolveIcon` — so this is a shape cast rather than a second
        // validation. A missing icon is ordinary: the tile falls back.
        icon:
          row.icon?.set && row.icon.name
            ? ({ set: row.icon.set, name: row.icon.name } as IconRef)
            : undefined,
        why: row.why ?? [],
      }))
    },
    // A suggestion costs a scan whether or not it came back with anything, so
    // the meter on the Me tab is wrong the moment this settles. Invalidated on
    // failure too: a request that was refused for being over the ceiling is the
    // one that most needs the count on screen to catch up.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.scanQuota(userId) })
    },
  })
}
