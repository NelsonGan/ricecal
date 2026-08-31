import '@/i18n'

import { ONBOARDING_STEPS } from '@/features/onboarding'
import { render, screen, waitFor } from '@/test-utils'
import Index from '../index'

/**
 * The entry point's questions, in the order that makes them a flow.
 *
 * The case worth pinning is the last one: a session whose account has been
 * deleted still reads as "signed in" on the phone, and until this guard existed
 * it sent a returning user into the onboarding questions — which then failed to
 * save, because the profile row they write was deleted with the account.
 */

const mockSession = jest.fn()
const mockProfile = jest.fn()
const mockDraft = jest.fn()
const mockSignOut = jest.fn(() => Promise.resolve())
const mockEnterApp = jest.fn()

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native')
    return <Text>redirect:{href}</Text>
  },
}))

jest.mock('@/data', () => ({
  useSession: () => mockSession(),
  useProfile: () => mockProfile(),
}))

jest.mock('@/data/auth', () => ({
  signOut: () => mockSignOut(),
}))

// Landing on the app is a reset rather than a redirect — see `useEnterApp` —
// so this route's last answer is a call rather than a rendered href.
jest.mock('@/lib/navigation', () => ({
  useEnterApp: () => mockEnterApp,
}))

jest.mock('@/features/onboarding', () => ({
  useOnboardingDraft: () => ({ draft: mockDraft() }),
  isComplete: (draft: unknown) => Boolean(draft),
  // The real list, so the assertion below is about the flow rather than about a
  // path spelled out twice. A screen added to the front of it should fail here
  // rather than in the app.
  ONBOARDING_STEPS: jest.requireActual('@/features/onboarding/steps').ONBOARDING_STEPS,
}))

const session = { user: { id: 'user-1' } }

/** What `useProfile` looks like in each of its four states. */
const loaded = (profile: unknown) => ({
  data: profile,
  isPending: false,
  isPaused: false,
  isSuccess: true,
})
const pending = { data: undefined, isPending: true, isPaused: false, isSuccess: false }
const failed = { data: undefined, isPending: false, isPaused: false, isSuccess: false }
/**
 * Held for want of a connection, with nothing saved from a
 * previous launch to answer from. Pending, like the row above, and unlike it
 * never going to stop being pending.
 */
const paused = { data: undefined, isPending: true, isPaused: true, isSuccess: false }

beforeEach(() => {
  jest.clearAllMocks()
  mockSession.mockReturnValue({ session, loading: false })
  mockProfile.mockReturnValue(loaded({ onboarded_at: '2026-01-01T00:00:00Z' }))
  mockDraft.mockReturnValue(null)
})

const redirectTo = (href: string) => screen.getByText(`redirect:${href}`)

it('waits rather than guessing while the keychain is being read', async () => {
  mockSession.mockReturnValue({ session: null, loading: true })

  await render(<Index />)

  expect(screen.queryByText(/^redirect:/)).toBeNull()
})

it('starts a visitor with no session at the top of the flow', async () => {
  mockSession.mockReturnValue({ session: null, loading: false })
  mockDraft.mockReturnValue({ targetWeightKg: 58 })

  await render(<Index />)

  // Even with answers on disk: the draft outlives the account it was flushed for.
  expect(redirectTo('/welcome')).toBeTruthy()
})

it('sends an onboarded user to the app', async () => {
  await render(<Index />)

  // Not a redirect: entering the app clears what is under it, because signing
  // in reaches this route with the welcome screen still on the stack.
  await waitFor(() => expect(mockEnterApp).toHaveBeenCalled())
})

it('flushes the answers a half-finished account already has on this phone', async () => {
  mockProfile.mockReturnValue(loaded({ onboarded_at: null }))
  mockDraft.mockReturnValue({ targetWeightKg: 58 })

  await render(<Index />)

  expect(redirectTo('/finish')).toBeTruthy()
})

it('asks the questions when the account never finished and the phone has no draft', async () => {
  mockProfile.mockReturnValue(loaded({ onboarded_at: null }))

  await render(<Index />)

  // The TOP of the flow, not the first screen that asks about a body. It was
  // `/about` until the language and units screen went in front of it, and the
  // gap is a loop rather than a cosmetic one: `units` is only collected on
  // `setup`, `isComplete` requires it, and `finish` sends an incomplete draft
  // back here. Whoever signed in before answering anything could not get out.
  expect(redirectTo(`/${ONBOARDING_STEPS[0]}`)).toBeTruthy()
})

it('signs out a session whose account has been deleted', async () => {
  mockProfile.mockReturnValue(loaded(null))

  await render(<Index />)

  await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
  // And holds still meanwhile, so nobody lands mid-flow on the way out.
  expect(screen.queryByText(/^redirect:/)).toBeNull()
  expect(mockEnterApp).not.toHaveBeenCalled()
})

/**
 * The launch this app used to answer with a spinner that had nothing to wait
 * for. Saying so is the whole fix: there is no retry, because react-query
 * resumes the query itself and this screen then redirects.
 */
it('says so rather than spinning when the profile cannot be fetched or recalled', async () => {
  mockProfile.mockReturnValue(paused)

  await render(<Index />)

  expect(screen.getByText('Waiting for a connection')).toBeTruthy()
  expect(screen.queryByText(/^redirect:/)).toBeNull()
})

/** And a paused profile is not a deleted account. */
it('does not sign out over a profile it could not ask for', async () => {
  mockProfile.mockReturnValue(paused)

  await render(<Index />)

  expect(mockSignOut).not.toHaveBeenCalled()
})

it('does not sign out over a profile that has not loaded yet', async () => {
  mockProfile.mockReturnValue(pending)

  await render(<Index />)

  expect(mockSignOut).not.toHaveBeenCalled()
})

it('does not sign out over a profile the app failed to read', async () => {
  // A failed read is a network problem, not a deleted account, and signing out
  // over one would put a user back on the welcome screen every time a request
  // dropped.
  mockProfile.mockReturnValue(failed)

  await render(<Index />)

  expect(mockSignOut).not.toHaveBeenCalled()
})

/**
 * And it does not answer the OTHER question either. Undefined-because-it-failed
 * took the same branch as a genuine `onboarded_at: null`, so one dropped request
 * sent a returning user into the questions — which end on "we could not save
 * your answers" for an account that finished them months ago.
 */
it('does not read a failed profile request as an account that never onboarded', async () => {
  mockProfile.mockReturnValue(failed)

  await render(<Index />)

  expect(screen.queryByText(/^redirect:/)).toBeNull()
  expect(screen.getByText('Waiting for a connection')).toBeTruthy()
})
