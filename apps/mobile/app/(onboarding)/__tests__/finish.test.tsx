import { render as rntlRender, screen } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ONBOARDING_STEPS } from '@/features/onboarding'
import { ThemeProvider } from '@/theme/ThemeProvider'
import FinishStep from '../finish'

/**
 * The guards in front of the one write onboarding makes, and the pair of them
 * is where a loop lived.
 *
 * An incomplete draft is sent back to the questions, and WHICH question decides
 * whether the flow can end. It named `about`, the first screen that asks about a
 * body, while `units` was collected one screen earlier on `setup` — so a draft
 * missing only that answer was returned to a screen that could not supply it and
 * arrived straight back here. Somebody who signed in before answering anything,
 * which is what "I already have an account" does for a new social account, walked
 * the questions and was put back at the top of them, forever.
 *
 * Nothing below is about the write itself. `Flush` is a network mutation and a
 * screen of its own; these two are the branches that run before it.
 */

const mockSession = jest.fn()
const mockDraft = jest.fn()

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native')
    return <Text>redirect:{href}</Text>
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))

// The real `isComplete` and the real step list: what this file is about is a
// draft one answer short, and which screen that answer is collected on.
jest.mock('@/features/onboarding', () => ({
  ...jest.requireActual('@/features/onboarding/steps'),
  useOnboardingDraft: () => ({ draft: mockDraft(), clear: jest.fn() }),
  isComplete: jest.requireActual('@/features/onboarding/draft').isComplete,
}))

jest.mock('@/data', () => ({
  useSession: () => mockSession(),
  useFinishOnboarding: () => ({ mutate: jest.fn(), isPaused: false, isError: false }),
}))

/**
 * The insets as well as the palette, unlike `@/test-utils`: the branch where
 * nothing redirects renders the saving screen, and `Screen` measures the safe
 * area rather than falling back when there is none.
 */
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

const redirectTo = (href: string) => screen.queryByText(`redirect:${href}`)

/** Every answer `isComplete` asks for, so a test can take one away. */
const complete = {
  units: 'metric',
  sex: 'female',
  age: 29,
  heightCm: 164,
  weightKg: 65,
  targetWeightKg: 58,
  activity: 'light',
  referralSource: 'tiktok',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSession.mockReturnValue({ session: { user: { id: 'user-1' } }, loading: false })
  mockDraft.mockReturnValue(complete)
})

it('sends a draft with no units back to the screen that asks for them', async () => {
  mockDraft.mockReturnValue({ ...complete, units: undefined })

  await render(<FinishStep />)

  // The top of the flow, and it has to be: every field `isComplete` wants is
  // collected between there and here, so anywhere further in is a screen that
  // cannot answer the question that sent the user to it.
  expect(redirectTo(`/${ONBOARDING_STEPS[0]}`)).toBeTruthy()
})

it('sends a visitor with no session back to the entry point to be placed', async () => {
  mockSession.mockReturnValue({ session: null, loading: false })

  await render(<FinishStep />)

  expect(redirectTo('/')).toBeTruthy()
})

it('writes rather than redirecting once every answer is in hand', async () => {
  await render(<FinishStep />)

  expect(screen.queryByText(/^redirect:/)).toBeNull()
})
