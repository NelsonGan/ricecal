// What to eat next: seven suggestions against the rest of today's budget.
//
// One model call and no writes. Every other model path in this app ends in a
// row — `scan-meal` writes the entry itself, `scan-refine` edits one, the
// recipe reader fills a form — and this one ends on a screen. Nothing here
// touches `food_logs`, `food_scan_items` or the catalogue, which is why it
// reads the diary with the CALLER'S OWN token rather than as `service_role`:
// there is nothing it needs to do that RLS would stand in the way of, so it
// does not take a credential that could.
//
// THE DAY IS ASSEMBLED HERE, NOT SENT BY THE CLIENT. The remaining budget, the
// macros still owed and what has already been eaten are all read fresh off the
// database, for two reasons. A client-supplied budget is a client-supplied
// budget: it decides how big a meal the model offers, and a stale one (the app
// has been backgrounded since lunch) produces a suggestion for a day that has
// moved on. And it is one round trip either way, because the client would have
// had to be told the same figures first.
//
// It is PRO, and it claims a scan, exactly as `scan-refine` does. Asking a
// model what to eat is the same kind of request as asking it to fix a meal by
// typing: discretionary, repeatable at the press of a button ("Try again"), and
// with no cheaper tier underneath to fall back to.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'

import {
  claimScan,
  createMeter,
  NotEntitled,
  requireEntitlement,
  ScanLimitReached,
} from '../_shared/entitlement.ts'
import { mockActive } from '../_shared/llm.ts'
import {
  type Cuisine,
  type DayContext,
  type Focus,
  MAX_CUISINE_LENGTH,
  type Meal,
  type SuggestMockSteer,
  suggestMeals,
} from '../_shared/suggest.ts'

type SuggestRequest = {
  meal?: string
  focus?: string
  cuisine?: string
  kcal_limit?: number
  /** Lean towards the lighter of two dishes that both fit. Defaults on. */
  healthy?: boolean
  /** The day to suggest against. Defaults to the user's own today. */
  date?: string
  mock?: SuggestMockSteer
}

const MEALS = new Set(['breakfast', 'lunch', 'dinner', 'snack'])
const FOCUSES = new Set(['protein', 'balanced', 'carbs'])

/**
 * The cuisine is NOT checked against a list, and there is no longer one to
 * check it against.
 *
 * The bound is imported rather than restated. `cuisinePhrase` applies it again
 * on the way into the prompt, which is the one that matters; this one only
 * keeps an absurd body out of the rest of the function.
 */

/**
 * The bounds on the ceiling the user can ask for.
 *
 * The floor is 100 because below that there is no meal to suggest, only a
 * drink, and the ceiling is 2,000 because a single sitting past that is a
 * figure somebody has typed by mistake. The sheet's own slider already sits
 * inside these; this is the version that holds when the request does not come
 * from the sheet.
 */
const MIN_KCAL = 100
const MAX_KCAL = 2000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** A number the way the day is counted: whole, and never below zero. */
const shortfall = (goal: number, eaten: number): number => Math.max(0, Math.round(goal - eaten))

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'missing Authorization header' }, 401)

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: auth, error: authError } = await anonClient.auth.getUser()
  const userId = auth.user?.id
  if (authError || !userId) return json({ ok: false, error: 'not signed in' }, 401)

  let body: SuggestRequest
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'body is not JSON' }, 400)
  }

  const meal = body.meal ?? ''
  const focus = body.focus ?? ''
  const cuisine =
    typeof body.cuisine === 'string' ? body.cuisine.trim().slice(0, MAX_CUISINE_LENGTH) : ''
  if (!MEALS.has(meal) || !FOCUSES.has(focus)) {
    return json({ ok: false, error: 'meal and focus are required' }, 400)
  }
  const kcalLimit = Math.round(Number(body.kcal_limit))
  if (!Number.isFinite(kcalLimit) || kcalLimit < MIN_KCAL || kcalLimit > MAX_KCAL) {
    return json({ ok: false, error: `kcal_limit must be between ${MIN_KCAL} and ${MAX_KCAL}` }, 400)
  }
  const mock = mockActive() ? body.mock : undefined

  // The two gates, in the order every other endpoint asks them: is this account
  // allowed the model at all, and has it any budget left today. Claimed once,
  // here, before the day is read and before the model is called — an account
  // already at its ceiling must not get to send the request that put it there.
  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  try {
    await requireEntitlement(db, userId, 'suggest')
    await claimScan(db, userId)
  } catch (error) {
    if (error instanceof NotEntitled) {
      return json(
        { ok: false, code: 'not_entitled', feature: error.feature, error: 'subscription required' },
        402,
      )
    }
    if (error instanceof ScanLimitReached) {
      return json(
        {
          ok: false,
          code: 'scan_limit',
          used: error.used,
          limit: error.dailyLimit,
          entitled: error.entitled,
          error: error.message,
        },
        429,
      )
    }
    throw error
  }
  const meter = createMeter()

  /**
   * The day, read as the user.
   *
   * `local_today()` rather than a date off the phone, for the reason
   * `scan_usage` is keyed that way: only the server knows which day it is where
   * this person is. A client MAY name a date — the sheet is opened against
   * whichever day Today has selected — and it is trusted only as far as being a
   * date, since it can reach nothing but this account's own rows. Checked for
   * SHAPE all the same: a malformed value makes every read below error, and the
   * fallbacks would then present the day as "nothing eaten, full budget", which
   * is a confident answer about a day nobody asked about.
   */
  const { data: todayRow } = await anonClient.rpc('local_today')
  const asked = typeof body.date === 'string' ? body.date : ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : (todayRow as string)

  const [goalsResult, nutritionResult, activityResult, settingsResult, entriesResult] =
    await Promise.all([
      // `goals_on(date)` and NOT `current_daily_goals`, which is the goal in
      // force TODAY. A budget tightened on Thursday must not be the line a
      // suggestion for last Tuesday is measured against — the same reason
      // `day_marks` joins the goal per day rather than taking it once.
      anonClient.rpc('goals_on', { p_date: date }),
      anonClient
        .from('daily_nutrition')
        .select('kcal, protein_g, carbs_g, fat_g')
        .eq('log_date', date)
        .maybeSingle(),
      // Movement EXTENDS the budget, so it has to be read here too. Without it
      // this endpoint tells the model a smaller figure than the card that
      // opened the sheet is showing, and a user whose walk covered an excess
      // gets "they have already used today's budget" under a ring saying they
      // are in credit. One day, three surfaces, one sum.
      anonClient.from('activity_days').select('active_kcal').eq('log_date', date).maybeSingle(),
      anonClient.from('user_settings').select('activity_extends_budget').maybeSingle(),
      // Names only, newest first, and a handful of them. The model is being told
      // what this person has eaten so it can connect the two ends of a day; a
      // whole day of rows would be a list it starts summarising back.
      anonClient
        .from('food_log_details')
        .select('food_name, logged_at')
        .eq('log_date', date)
        .order('logged_at', { ascending: false })
        .limit(8),
    ])

  const goals = goalsResult.data as {
    kcal: number | null
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
  } | null
  const eatenRow = nutritionResult.data as {
    kcal: number | null
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
  } | null
  const entries = (entriesResult.data ?? []) as Array<{ food_name: string | null }>

  // Only ACTIVE energy, and only when the account counts it. The same two rules
  // the ring on Today applies, for the same reasons: the goal is already a
  // Mifflin-St Jeor figure containing basal metabolism, and
  // `activity_extends_budget` is the user's own answer to whether movement
  // counts at all. Defaults to counting, which is the column's default.
  const extendsBudget =
    (settingsResult.data as { activity_extends_budget: boolean } | null)
      ?.activity_extends_budget !== false
  const burned = extendsBudget
    ? Number((activityResult.data as { active_kcal: number | null } | null)?.active_kcal ?? 0)
    : 0

  const day: DayContext = {
    meal: meal as Meal,
    focus: focus as Focus,
    cuisine: cuisine as Cuisine,
    // Defaults ON for a caller that does not say, which is the version of this
    // endpoint that existed before the toggle did.
    healthy: body.healthy !== false,
    kcalLimit,
    /**
     * An account with no budget yet is given the CEILING as its remaining
     * budget rather than zero. `daily_goals` is deliberately empty until
     * onboarding computes a target, and "you have used today's budget" is the
     * wrong sentence about somebody who has never had one — the model would
     * spend every reason apologising for a day that has not gone wrong.
     */
    kcalLeft: goals?.kcal ? shortfall(goals.kcal + burned, Number(eatenRow?.kcal ?? 0)) : kcalLimit,
    proteinLeftG: shortfall(Number(goals?.protein_g ?? 0), Number(eatenRow?.protein_g ?? 0)),
    carbsLeftG: shortfall(Number(goals?.carbs_g ?? 0), Number(eatenRow?.carbs_g ?? 0)),
    fatLeftG: shortfall(Number(goals?.fat_g ?? 0), Number(eatenRow?.fat_g ?? 0)),
    eaten: entries.map((entry) => entry.food_name ?? '').filter(Boolean),
  }

  /**
   * A failure here is an empty list, not an HTTP error.
   *
   * The same answer the scan cascade gives now that it has no floor under it:
   * a guess dressed as an answer is worse than an admission, because nothing
   * downstream can tell the two apart. The screen reads `picks: []` as "we
   * could not think of anything", which is the truth and is one tap from
   * another try.
   */
  let picks: Awaited<ReturnType<typeof suggestMeals>> = []
  try {
    picks = await suggestMeals(day, mock, meter)
  } catch (error) {
    console.error('[suggest-meal] the model would not answer', error)
  }

  return json({ ok: true, picks, requests: meter.spent() })
})
