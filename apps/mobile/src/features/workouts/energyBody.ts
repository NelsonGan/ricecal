import { bodyFrom, useCurrentWeight, useProfile } from '@/data'
import { basalRate } from '@/lib/nutrition'
import type { EnergyBody } from './energy'

/**
 * The body an estimate is priced against: the latest weigh-in, and the resting
 * rate the budget itself is built on (Mifflin-St Jeor) when the profile has
 * what it needs, so the rest taken out of a workout is this person's.
 */
export function useEnergyBody(): EnergyBody | undefined {
  const weightKg = useCurrentWeight()
  const profile = useProfile().data
  if (!weightKg) return undefined
  const body = bodyFrom(profile, weightKg)
  return { weightKg, restingKcalPerDay: body ? basalRate(body) : null }
}
