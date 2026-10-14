import { isFreshRecovery } from '../recovery'

/**
 * Whether a session came from a password-reset link, which is the only kind
 * allowed to set a new password without proving anything else. Read off the
 * token's `amr` claim, which Supabase stamps with how the session was obtained.
 */

const NOW = Date.UTC(2026, 9, 14, 12, 0, 0)
const token = (claims: object) =>
  `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`
const session = (method: string, secondsAgo: number) => ({
  access_token: token({ amr: [{ method, timestamp: NOW / 1000 - secondsAgo }] }),
})

it('accepts a session the reset link produced a moment ago', () => {
  expect(isFreshRecovery(session('recovery', 10), NOW)).toBe(true)
})

it('refuses a session from a password, a code or a social sign-in', () => {
  expect(isFreshRecovery(session('password', 10), NOW)).toBe(false)
  expect(isFreshRecovery(session('otp', 10), NOW)).toBe(false)
  expect(isFreshRecovery(session('oauth', 10), NOW)).toBe(false)
})

it('refuses a reset link long enough ago that the session has simply been kept', () => {
  // The claim survives every refresh, so on its own it would last for weeks.
  expect(isFreshRecovery(session('recovery', 16 * 60), NOW)).toBe(false)
})

it('refuses no session, and a token it cannot read', () => {
  expect(isFreshRecovery(null, NOW)).toBe(false)
  expect(isFreshRecovery({ access_token: 'not-a-token' }, NOW)).toBe(false)
  expect(isFreshRecovery({ access_token: 'a.%%%.b' }, NOW)).toBe(false)
  expect(isFreshRecovery({ access_token: token({ sub: 'u1' }) }, NOW)).toBe(false)
})
