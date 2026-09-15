import '@/i18n'
import i18n, { SUPPORTED_LANGUAGES } from '@/i18n'
import { trialDurationText, trialProgress } from '../trial'

it('translates day and month trial periods without a seven-day assumption', () => {
  const t = i18n.getFixedT('en', 'paywall')
  expect(trialDurationText(t, { unit: 'day', count: 1 })).toBe('1 day')
  expect(trialDurationText(t, { unit: 'day', count: 3 })).toBe('3 days')
  expect(trialDurationText(t, { unit: 'month', count: 1 })).toBe('1 month')
})

it('provides each store period in every bundled language', () => {
  for (const language of SUPPORTED_LANGUAGES) {
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
