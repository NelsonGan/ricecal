import { format } from 'date-fns/format'

import { createJsonStore } from '@/lib/jsonStore'

/**
 * Which trial each account on this phone has been asked about, so the offer
 * to turn notifications on is put to somebody once per trial, not once per
 * launch. On the phone, per account, because notification permission is the
 * phone's.
 *
 * Keyed by the day the trial ends rather than the instant: the store's
 * receipt and our mirror can disagree on the second, never on the day.
 */
const store = createJsonStore<string | null>(
  'ricecal-trial-reminder',
  (stored) => (typeof stored === 'string' ? stored : null),
  { bestEffort: true },
)

const trialKey = (endsAt: Date) => format(endsAt, 'yyyy-MM-dd')

export function trialReminderOffered(userId: string, endsAt: Date): boolean {
  return store.get(userId) === trialKey(endsAt)
}

/**
 * Stored before the sheet is on screen, as the Locations offer is, so a crash
 * or a kill while it is up never brings it back. The welcome screen marks it
 * too when it asks, so somebody who has just answered the system prompt there
 * is not asked again on Today a moment later.
 */
export function markTrialReminderOffered(userId: string, endsAt: Date): void {
  store.set(userId, trialKey(endsAt))
}
