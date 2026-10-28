import type { PhotoRemoval } from '@/data/photoRemovals'
import i18n from '@/i18n'
import { markNoticed, NOTICE_DAYS, noticeDue, summarize, whenLabel } from '../notice'

const DAY = 24 * 60 * 60 * 1000
// A Wednesday.
const now = new Date(2026, 9, 28, 10, 0)
const row = (offsetDays: number): PhotoRemoval => ({
  id: String(offsetDays),
  log_date: '2026-09-28',
  photo_path: `meals/u/${offsetDays}.jpg`,
  item_name: 'Nasi lemak',
  removes_at: new Date(now.getTime() + offsetDays * DAY).toISOString(),
})

describe('summarize', () => {
  it('counts only what goes inside the window, by the last of them', () => {
    const summary = summarize([row(-0.1), row(1), row(2), row(NOTICE_DAYS + 1)], now)
    expect(summary?.count).toBe(3)
    expect(summary?.removesBy.getTime()).toBe(now.getTime() + 2 * DAY)
  })
  it('is nothing when nothing is due', () => {
    expect(summarize([row(NOTICE_DAYS + 2)], now)).toBeNull()
    expect(summarize([], now)).toBeNull()
  })
})

describe('whenLabel', () => {
  const t = i18n.getFixedT('en', 'logging')
  it('says today, tomorrow, or by the weekday', () => {
    expect(whenLabel(t, new Date(now.getTime() - DAY), now)).toBe('today')
    expect(whenLabel(t, new Date(now.getTime() + DAY), now)).toBe('tomorrow')
    expect(whenLabel(t, new Date(now.getTime() + 2 * DAY), now)).toBe('by Friday')
  })
  it('reads as one sentence in the toast', () => {
    expect(t('photoRemovals.toast', { count: 14, when: 'by Friday' })).toBe(
      '14 meal photos will be removed by Friday',
    )
    expect(t('photoRemovals.toast', { count: 1, when: 'today' })).toBe(
      '1 meal photo will be removed today',
    )
  })
})

describe('noticeDue', () => {
  it('stays quiet for a window after a notice', () => {
    expect(noticeDue('n1', now.getTime())).toBe(true)
    markNoticed('n1', now.getTime())
    expect(noticeDue('n1', now.getTime() + DAY)).toBe(false)
    expect(noticeDue('n1', now.getTime() + NOTICE_DAYS * DAY)).toBe(true)
  })
})
