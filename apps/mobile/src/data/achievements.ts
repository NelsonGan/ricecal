import { useQuery } from '@tanstack/react-query'
import { subDays } from 'date-fns'

import { supabase } from '@/lib/supabase'
import { BADGE_GOALS, evaluateAchievements } from './achievement-rules'
import { dateKey, today, unwrap } from './client'
import { useTargets } from './goals'
import { keys } from './keys'
import { toEntry, toIcon } from './mappers'
import { useUserId } from './session'
import type { Achievement, AchievementKey, AchievementRule, DayLog, FoodLogRow } from './types'

/** How far back the badge rules look. A 30-day streak needs at least that. */
const WINDOW_DAYS = 120

/**
 * The badge catalogue: what each badge looks like and what order they come in.
 *
 * Read from the database because that is where a designer changes a tone or
 * adds a badge without shipping an app update. The rule behind each one is
 * not there — see `achievement-rules.ts` for why.
 */
export function useAchievementCatalogue() {
  return useQuery({
    queryKey: keys.achievementCatalogue(),
    // The catalogue changes when someone edits a table by hand, which is to
    // say almost never. Refetching it per screen visit is pure noise.
    staleTime: 1000 * 60 * 60,
    queryFn: async (): Promise<AchievementRule[]> => {
      const rows = unwrap(
        await supabase
          .from('achievements')
          .select('key, icon_set, icon_name, tone, position')
          .order('position'),
      )

      return rows.flatMap((row) => {
        const goal = BADGE_GOALS[row.key]
        // A badge in the table with no rule in the app is skipped rather than
        // rendered as an unreachable trophy. It means the two halves are out
        // of step, and the panel is not the place to find that out.
        if (!goal) return []
        return [
          {
            id: row.key,
            labelKey: row.key as AchievementKey,
            icon: toIcon(row.icon_set, row.icon_name),
            tone: row.tone,
            unit: goal.unit,
            goal: goal.goal,
          },
        ]
      })
    },
  })
}

/**
 * Every badge, evaluated against this user's logging.
 *
 * One query for the window rather than one per badge: the rules all read the
 * same entries, and four months of a heavy user's diary is a few hundred rows.
 */
export function useAchievements(): Achievement[] {
  const userId = useUserId()
  const { data: rules } = useAchievementCatalogue()
  const { data: targets } = useTargets()

  const from = dateKey(subDays(new Date(), WINDOW_DAYS))

  const { data } = useQuery({
    queryKey: ['achievement-window', userId, from],
    queryFn: async () => {
      const [entries, water, workouts] = await Promise.all([
        supabase
          .from('food_log_details')
          .select('*')
          .eq('user_id', userId)
          .gte('log_date', from)
          .order('logged_at'),
        supabase
          .from('daily_logs')
          .select('log_date, water_glasses')
          .eq('user_id', userId)
          .gte('log_date', from),
        supabase.from('workouts').select('distance_km').eq('user_id', userId),
      ])

      const days: Record<string, DayLog> = {}
      const dayFor = (date: string): DayLog => {
        const existing = days[date]
        if (existing) return existing
        const created: DayLog = { date, entries: [], waterGlasses: 0 }
        days[date] = created
        return created
      }

      for (const row of unwrap(entries) as FoodLogRow[]) {
        const entry = toEntry(row)
        dayFor(entry.logDate).entries.push(entry)
      }

      // Water lands on days that may have no entries at all — a day where
      // somebody drank but did not eat is still a day the badge rules see.
      for (const row of unwrap(water)) {
        dayFor(row.log_date).waterGlasses = row.water_glasses
      }

      const totalDistanceKm = unwrap(workouts).reduce(
        (total, row) => total + Number(row.distance_km ?? 0),
        0,
      )

      return { days, totalDistanceKm }
    },
  })

  if (!rules || !data) return []
  return evaluateAchievements(rules, {
    days: data.days,
    todayKey: today(),
    targets: targets ?? null,
    totalDistanceKm: data.totalDistanceKm,
  })
}

/**
 * The logging streak, measured by the database.
 *
 * `logging_streak()` is a gaps-and-islands query over `food_logs` — cheaper
 * and more correct than pulling every date to the phone to count runs, and it
 * is the same number the reminder job will read.
 */
export function useStreak(): { current: number; best: number } {
  const userId = useUserId()

  const { data } = useQuery({
    queryKey: keys.streak(userId),
    queryFn: async () => {
      const rows = unwrap(await supabase.rpc('logging_streak'))
      const row = Array.isArray(rows) ? rows[0] : rows
      return {
        current: row?.current_days ?? 0,
        best: row?.best_days ?? 0,
      }
    },
  })

  return data ?? { current: 0, best: 0 }
}
