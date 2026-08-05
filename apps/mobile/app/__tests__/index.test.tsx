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

jest.mock('@/features/onboarding', () => ({
  useOnboardingDraft: () => ({ draft: mockDraft() }),
  isComplete: (draft: unknown) => Boolean(draft),
}))

const session = { user: { id: 'user-1' } }

/** What `useProfile` looks like in each of its three states. */
const loaded = (profile: unknown) => ({ data: profile, isPending: false, isSuccess: true })
const pending = { data: undefined, isPending: true, isSuccess: false }
const failed = { data: undefined, isPending: false, isSuccess: false }

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
  mockDraft.mockReturnValue({ goal: 'lose' })

  await render(<Index />)

  // Even with answers on disk: the draft outlives the account it was flushed for.
  expect(redirectTo('/welcome')).toBeTruthy()
})

it('sends an onboarded user to the app', async () => {
  await render(<Index />)

  expect(redirectTo('/today')).toBeTruthy()
})

it('flushes the answers a half-finished account already has on this phone', async () => {
  mockProfile.mockReturnValue(loaded({ onboarded_at: null }))
  mockDraft.mockReturnValue({ goal: 'lose' })

  await render(<Index />)

  expect(redirectTo('/finish')).toBeTruthy()
})

it('asks the questions when the account never finished and the phone has no draft', async () => {
  mockProfile.mockReturnValue(loaded({ onboarded_at: null }))

  await render(<Index />)

  expect(redirectTo('/goal')).toBeTruthy()
})

it('signs out a session whose account has been deleted', async () => {
  mockProfile.mockReturnValue(loaded(null))

  await render(<Index />)

  await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
  // And holds still meanwhile, so nobody lands mid-flow on the way out.
  expect(screen.queryByText(/^redirect:/)).toBeNull()
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
