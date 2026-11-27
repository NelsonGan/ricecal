import '@/i18n'
import i18n, { SUPPORTED_LANGUAGES } from '@/i18n'
import {
  trialDurationText,
  trialEnd,
  trialProgress,
  trialReminderAt,
  trialTimeline,
} from '../trial'

it('translates day and month trial periods without a seven-day assumption', () => {
  const t = i18n.getFixedT('en', 'paywall')
  expect(trialDurationText(t, { unit: 'day', count: 1 })).toBe('1 day')
  expect(trialDurationText(t, { unit: 'day', count: 3 })).toBe('3 days')
  expect(trialDurationText(t, { unit: 'month', count: 1 })).toBe('1 month')
})

it('provides each store period in every bundled language', async () => {
  // A bundle is loaded when its language is asked for. Unloaded, `getFixedT`
  // would answer every one of these in English and prove nothing.
  await i18n.loadLanguages(SUPPORTED_LANGUAGES)
  for (const language of SUPPORTED_LANGUAGES) {
    expect(i18n.hasResourceBundle(language, 'paywall')).toBe(true)
    const t = i18n.getFixedT(language, 'paywall')
    for (const unit of ['day', 'week', 'month', 'year'] as const) {
      const phrase = trialDurationText(t, { unit, count: 2 })
      expect(phrase).toContain('2')
      expect(phrase).not.toContain('hard.trialDuration')
    }
  }
})

it('uses the purchased trial dates for its progress', () => {
  expect(
    trialProgress(
      '2026-09-01T00:00:00Z',
      '2026-09-04T00:00:00Z',
      Date.parse('2026-09-02T12:00:00Z'),
    ),
  ).toBe(0.5)
  expect(
    trialProgress(
      '2026-09-01T00:00:00Z',
      '2026-09-15T00:00:00Z',
      Date.parse('2026-09-02T00:00:00Z'),
    ),
  ).toBeCloseTo(1 / 14)
  expect(trialProgress(null, '2026-09-15T00:00:00Z')).toBeNull()
})

describe('the trial timeline', () => {
  const now = new Date(2026, 10, 27, 15, 0)

  it('reminds three days before a week-long trial turns into a charge', () => {
    const timeline = trialTimeline({ unit: 'week', count: 1 }, now)
    expect(timeline.endsAt).toEqual(new Date(2026, 11, 4, 15, 0))
    expect(timeline.remindAt).toEqual(new Date(2026, 11, 1, 15, 0))
    expect(timeline.leadDays).toBe(3)
  })

  it('reminds sooner on a trial too short for three days, and not at all on one day', () => {
    expect(trialTimeline({ unit: 'day', count: 3 }, now)).toMatchObject({
      remindAt: new Date(2026, 10, 28, 15, 0),
      leadDays: 2,
    })
    expect(trialTimeline({ unit: 'day', count: 1 }, now)).toMatchObject({
      remindAt: null,
      leadDays: 0,
    })
  })

  it('counts months on the calendar, as the stores do', () => {
    expect(trialEnd(new Date(2026, 0, 31), { unit: 'month', count: 1 }).getMonth()).toBe(2)
    expect(trialEnd(now, { unit: 'year', count: 1 })).toEqual(new Date(2027, 10, 27, 15, 0))
  })

  it('books an unknown start as a full three days ahead', () => {
    const end = new Date(2026, 11, 4, 15, 0)
    expect(trialReminderAt(new Date(0), end)).toEqual(new Date(2026, 11, 1, 15, 0))
  })
})
