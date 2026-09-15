import type { TFunction } from 'i18next'

import type { TrialDuration } from '@/data/purchases'

export function isTrialUnit(value: string | undefined): value is TrialDuration['unit'] {
  return value === 'day' || value === 'week' || value === 'month' || value === 'year'
}

/** Keep a store period as one translated phrase so each sentence can reorder it. */
export function trialDurationText(t: TFunction<'paywall'>, duration: TrialDuration): string {
  return t(`hard.trialDuration.${duration.unit}`, { count: duration.count })
}

/** The bar follows the purchased trial's dates, even if the store changes its offer later. */
export function trialProgress(start: string | null, end: string | null, now = Date.now()) {
  if (!start || !end) return null
  const startedAt = new Date(start).getTime()
  const endsAt = new Date(end).getTime()
  if (!Number.isFinite(startedAt) || !Number.isFinite(endsAt) || endsAt <= startedAt) return null
  return Math.min(1, Math.max(0, (now - startedAt) / (endsAt - startedAt)))
}
