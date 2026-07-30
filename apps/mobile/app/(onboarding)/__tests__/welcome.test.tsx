import { render as rntlRender, screen, userEvent } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import Welcome from '../welcome'

/**
 * Why this suite exists: "Get started" used to walk an anonymous visitor into
 * the questions, and the questions cannot be answered without an account.
 *
 * This screen is reached from sign-in's "What is RiceCal?", so no session is the
 * ordinary case here. Every step past it writes to `profiles` through hooks that
 * call `useUserId`, which throws outright when there is none — so the old
 * `push('/goal')` was not a failed write, it was a crashed screen.
 */

const mockPush = jest.fn()
const mockReplace = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}))

jest.mock('@/data', () => ({ useSession: jest.fn() }))

const data = jest.mocked(require('@/data') as typeof import('@/data'))

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  )
}

const render = (ui: ReactElement) => rntlRender(ui, { wrapper: Providers })
const user = userEvent.setup()

const signedIn = (yes: boolean) => {
  data.useSession.mockReturnValue({
    session: yes ? ({ user: { id: 'u1' } } as never) : null,
    userId: yes ? 'u1' : null,
    loading: false,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  signedIn(false)
})

describe('with no session', () => {
  it('sends "Get started" to sign-up rather than into the questions', async () => {
    await render(<Welcome />)
    await user.press(screen.getByText('Get started'))

    expect(mockPush).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { mode: 'sign-up' },
    })
  })

  /** The label promises the sign-in side of that screen, so it has to ask for it. */
  it('opens sign-in on its sign-in side', async () => {
    await render(<Welcome />)
    await user.press(screen.getByText('I already have an account'))

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { mode: 'sign-in' },
    })
  })
})

describe('with a session', () => {
  it('starts the questions', async () => {
    signedIn(true)
    await render(<Welcome />)
    await user.press(screen.getByText('Get started'))

    expect(mockPush).toHaveBeenCalledWith('/goal')
  })
})
