import { clearRecovered, isRecovered, markRecovered } from '../recovery'

/**
 * Whether a session came from a password-reset link, which is the only kind
 * allowed to set a new password without proving anything else. Recorded when a
 * link's code is exchanged, never inferred from the session itself.
 */

const owner = { user: { id: 'owner' } }

afterEach(() => clearRecovered())

it('knows nothing until a reset link is exchanged', () => {
  // A signed-in phone opening the reset URL with no code is exactly this.
  expect(isRecovered(owner)).toBe(false)
})

it('accepts the account a reset link signed in, for a while', () => {
  markRecovered('owner')
  expect(isRecovered(owner)).toBe(true)
  expect(isRecovered(owner, Date.now() + 14 * 60 * 1000)).toBe(true)
  expect(isRecovered(owner, Date.now() + 16 * 60 * 1000)).toBe(false)
})

it('does not carry over to another account', () => {
  markRecovered('owner')
  expect(isRecovered({ user: { id: 'someone-else' } })).toBe(false)
  expect(isRecovered(null)).toBe(false)
})

it('ends the moment the reset is finished', () => {
  markRecovered('owner')
  clearRecovered()
  expect(isRecovered(owner)).toBe(false)
})
