import { createMMKV } from 'react-native-mmkv'
import { allowedEvent, exceptionAllowed, postHogAnalytics, startReplayForLaunch } from '../posthog'

jest.mock('posthog-react-native', () => ({ PostHog: jest.fn() }))

/**
 * The adapter between the analytics seam and the PostHog SDK. What matters is
 * money: every person-property write is a billable `$set`, and the email and
 * the profile are re-sent on every launch, so an unchanged answer must cost
 * nothing.
 */

function fakePostHog(distinctId = 'user-1') {
  const calls: unknown[][] = []
  return {
    calls,
    sdk: {
      capture: (...args: unknown[]) => void calls.push(['capture', ...args]),
      identify: (...args: unknown[]) => void calls.push(['identify', ...args]),
      reset: () => void calls.push(['reset']),
      register: async (...args: unknown[]) => void calls.push(['register', ...args]),
      getDistinctId: () => distinctId,
      setPersonProperties: (...args: unknown[]) => void calls.push(['set', ...args]),
      unsetPersonProperties: (...args: unknown[]) => void calls.push(['unset', ...args]),
      startSessionRecording: async () => void calls.push(['replay']),
    },
  }
}

beforeEach(() => {
  createMMKV({ id: 'ricecal-posthog-person' }).clearAll()
})

it('writes a person property once, and again only when it changes', () => {
  const fake = fakePostHog()
  // biome-ignore lint/suspicious/noExplicitAny: a partial SDK double
  const people = postHogAnalytics(fake.sdk as any).getPeople()

  people.set({ email: 'one@example.com', onboarded: true })
  people.set({ email: 'one@example.com', onboarded: true })
  people.set({ email: 'one@example.com', onboarded: false })

  expect(fake.calls).toEqual([
    ['set', { email: 'one@example.com', onboarded: true }, undefined, false],
    ['set', { onboarded: false }, undefined, false],
  ])
})

it('does not carry one account’s answers over to the next', () => {
  // biome-ignore lint/suspicious/noExplicitAny: a partial SDK double
  postHogAnalytics(fakePostHog('user-1').sdk as any)
    .getPeople()
    .set({ onboarded: true })
  const second = fakePostHog('user-2')
  // biome-ignore lint/suspicious/noExplicitAny: a partial SDK double
  postHogAnalytics(second.sdk as any)
    .getPeople()
    .set({ onboarded: true })

  expect(second.calls).toEqual([['set', { onboarded: true }, undefined, false]])
})

it('identifies with no properties, so a relaunch sends no $set', () => {
  const fake = fakePostHog()
  // biome-ignore lint/suspicious/noExplicitAny: a partial SDK double
  postHogAnalytics(fake.sdk as any).identify('user-1')
  expect(fake.calls).toEqual([['identify', 'user-1']])
})

it('clears the address on account deletion', () => {
  const fake = fakePostHog()
  // biome-ignore lint/suspicious/noExplicitAny: a partial SDK double
  postHogAnalytics(fake.sdk as any)
    .getPeople()
    .deleteUser()
  expect(fake.calls[0][0]).toBe('unset')
  expect(fake.calls[0][1]).toContain('email')
})

it('lets app events and the SDK events it relies on through, and nothing else', () => {
  expect(allowedEvent('Meal Logged')).toBe(true)
  expect(allowedEvent('$exception')).toBe(true)
  expect(allowedEvent('$identify')).toBe(true)
  expect(allowedEvent('$screen')).toBe(false)
  expect(allowedEvent('Application Opened')).toBe(true)
  expect(allowedEvent('$rageclick')).toBe(false)
})

it('decides a replay once per launch, at the first-day rate on a new install', () => {
  const fake = fakePostHog()
  // biome-ignore lint/suspicious/noExplicitAny: a partial SDK double
  expect(startReplayForLaunch(fake.sdk as any, true, () => 0.1)).toBe(true)
  // biome-ignore lint/suspicious/noExplicitAny: a partial SDK double
  expect(startReplayForLaunch(fake.sdk as any, true, () => 0)).toBe(false)
  expect(fake.calls).toEqual([['replay']])
})

it('sends an identical exception once per window, and at most 25 distinct ones', () => {
  const exception = (value: string) =>
    // biome-ignore lint/suspicious/noExplicitAny: a minimal capture event
    ({ event: '$exception', properties: { $exception_list: [{ type: 'Error', value }] } }) as any
  const start = 1_000_000_000
  expect(exceptionAllowed(exception('loop'), start)).toBe(true)
  expect(exceptionAllowed(exception('loop'), start + 1000)).toBe(false)
  for (let i = 0; i < 24; i++) expect(exceptionAllowed(exception(`e${i}`), start + 2000)).toBe(true)
  expect(exceptionAllowed(exception('one more'), start + 3000)).toBe(false)
  expect(exceptionAllowed(exception('loop'), start + 5 * 60 * 1000 + 1)).toBe(true)
})

it('keeps the build variant on events after a sign-out reset', () => {
  const fake = fakePostHog()
  // biome-ignore lint/suspicious/noExplicitAny: a partial SDK double
  postHogAnalytics(fake.sdk as any).reset()
  expect(fake.calls).toEqual([['reset'], ['register', { app_variant: 'development' }]])
})
