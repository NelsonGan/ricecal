import { isQuiet } from '@/lib/quiet-hours'

/**
 * Quiet hours.
 *
 * The window nearly always wraps midnight — 22:00 to 07:00 — so the naive
 * `from <= t && t < to` comparison is wrong for the common case rather than
 * for an edge one. That is the whole reason this function exists, and the
 * reason it is worth a test.
 */
describe('isQuiet', () => {
  const from = '22:00:00'
  const to = '07:00:00'

  it('silences the late evening', () => {
    expect(isQuiet({ hour: 23, minute: 0 }, from, to)).toBe(true)
  })

  it('silences the early morning on the other side of midnight', () => {
    expect(isQuiet({ hour: 2, minute: 30 }, from, to)).toBe(true)
  })

  it('allows a breakfast reminder after the window closes', () => {
    expect(isQuiet({ hour: 8, minute: 0 }, from, to)).toBe(false)
  })

  it('includes the start of the window and excludes its end', () => {
    // A reminder set for exactly 22:00 is inside quiet hours; one at exactly
    // 07:00 is not — otherwise a window silences a minute it never claimed.
    expect(isQuiet({ hour: 22, minute: 0 }, from, to)).toBe(true)
    expect(isQuiet({ hour: 7, minute: 0 }, from, to)).toBe(false)
  })

  it('handles a window that does not wrap', () => {
    // Somebody on a night shift may well want 09:00 to 17:00 quiet.
    expect(isQuiet({ hour: 12, minute: 0 }, '09:00:00', '17:00:00')).toBe(true)
    expect(isQuiet({ hour: 20, minute: 0 }, '09:00:00', '17:00:00')).toBe(false)
  })
})
