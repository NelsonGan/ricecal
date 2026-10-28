import { addDays, format, isSameDay } from 'date-fns'
import type { TFunction } from 'i18next'
import { createMMKV } from 'react-native-mmkv'
import type { PhotoRemoval } from '@/data/photoRemovals'

/**
 * How far ahead the notice on Today looks, and how long it then stays quiet.
 * The same six days as the push (`jobs/photo-warnings.ts`), so the two cover
 * the same photos and each one is warned about once, a few days early.
 */
export const NOTICE_DAYS = 6

const storage = createMMKV({ id: 'ricecal-photo-removals' })
const key = (userId: string) => `noticed:${userId}`

export function markNoticed(userId: string, now: number = Date.now()): void {
  storage.set(key(userId), now)
}

/** Whether this account has gone a whole window since its last notice. */
export function noticeDue(userId: string, now: number = Date.now()): boolean {
  const seen = storage.getNumber(key(userId))
  if (seen === undefined || seen > now) return true
  return now - seen >= NOTICE_DAYS * 24 * 60 * 60 * 1000
}

/** The photos going inside the window, and the day the last of them goes by. */
export function summarize(
  rows: readonly PhotoRemoval[],
  now: Date = new Date(),
): { count: number; removesBy: Date } | null {
  const horizon = addDays(now, NOTICE_DAYS).getTime()
  let count = 0
  let last = 0
  for (const row of rows) {
    const at = new Date(row.removes_at).getTime()
    if (at >= horizon) continue
    count += 1
    last = Math.max(last, at)
  }
  return count > 0 ? { count, removesBy: new Date(last) } : null
}

/** "by Friday", "tomorrow" or "today", in the app's own language. */
export function whenLabel(
  t: TFunction<'logging'>,
  removesBy: Date,
  now: Date = new Date(),
): string {
  if (removesBy <= now || isSameDay(removesBy, now)) return t('photoRemovals.today')
  if (isSameDay(removesBy, addDays(now, 1))) return t('photoRemovals.tomorrow')
  return t('photoRemovals.by', { day: format(removesBy, 'EEEE') })
}
