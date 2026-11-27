import type { TFunction } from 'i18next'

import type { TrialDuration } from '@/data/purchases'
import type { StoreEntitlement } from '@/lib/revenuecat'

export function isTrialUnit(value: string | undefined): value is TrialDuration['unit'] {
  return value === 'day' || value === 'week' || value === 'month' || value === 'year'
}

/** Keep a store period as one translated phrase so each sentence can reorder it. */
export function trialDurationText(t: TFunction<'paywall'>, duration: TrialDuration): string {
  return t(`hard.trialDuration.${duration.unit}`, { count: duration.count })
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How many days before the first charge the trial reminder lands. The paywall's
 * timeline promises it, and `useTrialReminderSync` books it, so both read this.
 */
export const TRIAL_REMINDER_DAYS = 3

/** When a trial of this length, starting at `start`, ends. Calendar units, as the stores count them. */
export function trialEnd(start: Date, duration: TrialDuration): Date {
  const end = new Date(start)
  if (duration.unit === 'day') end.setDate(end.getDate() + duration.count)
  else if (duration.unit === 'week') end.setDate(end.getDate() + duration.count * 7)
  else if (duration.unit === 'month') end.setMonth(end.getMonth() + duration.count)
  else end.setFullYear(end.getFullYear() + duration.count)
  return end
}

/**
 * Days ahead of the charge the reminder fires. Three, or fewer on a trial too
 * short to have three days left after its first: a reminder on the day the
 * trial starts reminds nobody of anything. Zero means no reminder at all.
 */
export function reminderLeadDays(start: Date, end: Date): number {
  const days = Math.floor((end.getTime() - start.getTime()) / DAY_MS)
  return Math.max(0, Math.min(TRIAL_REMINDER_DAYS, days - 1))
}

/** When the reminder for a trial ending at `end` fires, or null when it gets none. */
export function trialReminderAt(start: Date, end: Date): Date | null {
  const lead = reminderLeadDays(start, end)
  return lead > 0 ? new Date(end.getTime() - lead * DAY_MS) : null
}

export type TrialTimeline = {
  endsAt: Date
  remindAt: Date | null
  /** Days before the charge the reminder fires; zero when there is none. */
  leadDays: number
  /** The trial day each lands on, counting today as day 1's start: "Day 4". */
  remindDay: number | null
  endDay: number
}

/** The three moments the paywall shows for a trial starting now. */
export function trialTimeline(duration: TrialDuration, now = new Date()): TrialTimeline {
  const endsAt = trialEnd(now, duration)
  const remindAt = trialReminderAt(now, endsAt)
  const dayOf = (date: Date) => Math.round((date.getTime() - now.getTime()) / DAY_MS)
  return {
    endsAt,
    remindAt,
    leadDays: reminderLeadDays(now, endsAt),
    remindDay: remindAt ? dayOf(remindAt) : null,
    endDay: dayOf(endsAt),
  }
}

type Mirror = { status: string; trial_ends_at: string | null } | null | undefined

/**
 * The trial to remind somebody about, if any. `undefined` while neither source
 * has answered, so a launch does not cancel a booked reminder only to book it
 * again a second later.
 *
 * The store first, because only it knows whether the trial was cancelled
 * (`willRenew`), and a reminder that "you will be charged" sent to somebody who
 * cancelled is the opposite of what it was promised as. The mirror stands in
 * on a build with no store SDK; it has no will-renew, but a cancelled trial is
 * written there as `cancelled` rather than `trial`.
 */
export function trialToRemind(
  store: StoreEntitlement | null | undefined,
  mirror: Mirror,
): { start: Date | null; end: Date } | null | undefined {
  if (store) {
    if (!store.active || !store.trial || !store.willRenew || !store.expiresAt) return null
    return {
      start: store.trialStartedAt ? new Date(store.trialStartedAt) : null,
      end: new Date(store.expiresAt),
    }
  }
  if (store === undefined || mirror === undefined) return undefined
  if (mirror?.status !== 'trial' || !mirror.trial_ends_at) return null
  return { start: null, end: new Date(mirror.trial_ends_at) }
}

/** The bar follows the purchased trial's dates, even if the store changes its offer later. */
export function trialProgress(start: string | null, end: string | null, now = Date.now()) {
  if (!start || !end) return null
  const startedAt = new Date(start).getTime()
  const endsAt = new Date(end).getTime()
  if (!Number.isFinite(startedAt) || !Number.isFinite(endsAt) || endsAt <= startedAt) return null
  return Math.min(1, Math.max(0, (now - startedAt) / (endsAt - startedAt)))
}
