import { act, render, screen } from '@testing-library/react-native'
import AuthLanding from '../[action]'

/**
 * Where a link in an email lands. This route exists because
 * `ricecal://auth/callback` matched no file, so a login link opened the app on
 * "Page not found" while the sign-in went through invisibly behind it.
 *
 * A reset is not a sign-in, even though both produce a session: sent to `/`,
 * somebody resetting a password lands on Today with the password they came to
 * change still in force.
 *
 * And the redirect lives here rather than in `LoginLinkHandler`, which renders
 * outside the navigator, where an imperative navigation races the root layout on
 * a cold start from the mail.
 */

const mockParams: { action?: string } = {}
const session: { session: unknown; loading: boolean } = { session: null, loading: false }

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  // Rendered as its href, so a test can read where it went.
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native')
    return <Text>{`redirect:${href}`}</Text>
  },
}))

jest.mock('@/data', () => ({ useSession: () => session }))

jest.mock('@/ui', () => ({
  Spinner: () => {
    const { Text } = require('react-native')
    return <Text>spinner</Text>
  },
}))

const wentTo = () => screen.queryByText(/^redirect:/)?.props.children.replace('redirect:', '')

beforeEach(() => {
  jest.useFakeTimers()
  mockParams.action = 'callback'
  session.session = null
  session.loading = false
})

afterEach(() => {
  jest.useRealTimers()
})

it('waits while the handler is still redeeming the link', async () => {
  await render(<AuthLanding />)

  expect(screen.getByText('spinner')).toBeOnTheScreen()
  expect(wentTo()).toBeUndefined()
})

it('sends a signed-in visitor to the router, which decides where they belong', async () => {
  session.session = { user: { id: 'u1' } }
  await render(<AuthLanding />)

  expect(wentTo()).toBe('/')
})

/**
 * The one that matters. Both links produce a session; only this one means the
 * person is still halfway through changing a password.
 */
it('sends a password reset to the screen that finishes it', async () => {
  mockParams.action = 'reset'
  session.session = { user: { id: 'u1' } }
  await render(<AuthLanding />)

  expect(wentTo()).toBe('/(auth)/new-password')
})

/** A session that has not been read yet is not the same as no session. */
it('does not move while the keychain read is still in flight', async () => {
  session.session = { user: { id: 'u1' } }
  session.loading = true
  await render(<AuthLanding />)

  expect(screen.getByText('spinner')).toBeOnTheScreen()
})

/**
 * An expired or already-used link produces a toast and no session, and has no
 * signal of its own. Without the wait the app sits on a spinner for ever under
 * a message about something having gone wrong.
 */
it('gives up on a dead link rather than spinning for ever', async () => {
  await render(<AuthLanding />)
  expect(screen.getByText('spinner')).toBeOnTheScreen()

  await act(async () => {
    jest.advanceTimersByTime(8000)
  })

  expect(wentTo()).toBe('/')
})
