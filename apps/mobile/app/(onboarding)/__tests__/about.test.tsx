import { render as rntlRender, screen, userEvent } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { createMMKV } from 'react-native-mmkv'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import {
  type OnboardingDraft,
  OnboardingDraftProvider,
  useOnboardingDraft,
} from '@/features/onboarding'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { Text } from '@/ui'
import AboutStep from '../about'

/**
 * What this suite is for: the answers this screen records are the ones on screen,
 * and it records them without touching the network.
 *
 * Both halves have bitten. The screen used to write to `profiles` on every
 * interaction, which on the target weight slider is one request per frame of a
 * drag — `Slider` reports continuously — with the value that landed last decided
 * by whichever response came back last. And the controls show defaults nobody
 * chose, so a Continue that saved only what was touched left the database's budget
 * trigger with no sex and no birth date to read, and it gives up quietly.
 *
 * Everything here types by appending, and nothing re-renders. `fireEvent.changeText`
 * against these fields leaves React's root unusable for the rest of the file —
 * every later render comes back empty — and `user.clear()` ends in a blur, which
 * is where an emptied field is normalised back to the stored answer. Seeding the
 * store is how a test starts from a value other than the default.
 */

// `mock`-prefixed so the factory below may close over it: everything else is out
// of scope by the time jest hoists the call.
const mockPush = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}))

/** The same store the provider reads, so a test can arrange prior answers. */
const store = createMMKV({ id: 'ricecal-onboarding' })
const seed = (draft: OnboardingDraft) => store.set('draft', JSON.stringify(draft))

/** Reports what the draft holds, so a test can assert on it without a database. */
function DraftProbe() {
  const { draft } = useOnboardingDraft()
  return <Text>{JSON.stringify(draft)}</Text>
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        {/* No session: these answers are collected before the account exists. */}
        <OnboardingDraftProvider userId={null}>
          {children}
          <DraftProbe />
        </OnboardingDraftProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

const render = (ui: ReactElement) => rntlRender(ui, { wrapper: Providers })
const user = userEvent.setup()

const saved = () => JSON.parse(screen.getByText(/^\{/).props.children as string)

const continueOn = async () => {
  await user.press(screen.getByText('Continue'))
}

beforeEach(() => {
  jest.clearAllMocks()
  // The store outlives a render, which is the whole point of it — so each test
  // starts by emptying it rather than inheriting the last one's answers.
  store.clearAll()
})

it('records every answer on screen, including the ones never touched', async () => {
  await render(<AboutStep />)
  await continueOn()

  expect(saved()).toEqual(
    expect.objectContaining({ heightCm: 164, weightKg: 65, sex: 'female', age: 29 }),
  )
  // Group-qualified: `activity` names two routes in this app, and a bare
  // `/activity` resolved to whichever expo-router picked.
  expect(mockPush).toHaveBeenCalledWith('/(onboarding)/activity')
})

it('shows the answers already given rather than the defaults', async () => {
  seed({ heightCm: 178, weightKg: 80 })
  await render(<AboutStep />)

  expect(screen.getByLabelText('HEIGHT')).toHaveDisplayValue('178')
  expect(screen.getByLabelText('WEIGHT')).toHaveDisplayValue('80')
})

it('records what was typed', async () => {
  await render(<AboutStep />)

  // Appended to the 65 already there, so this is a genuine edit in progress.
  await user.type(screen.getByLabelText('WEIGHT'), '.5')
  await continueOn()

  expect(saved()).toEqual(expect.objectContaining({ weightKg: 65.5 }))
})

/**
 * Typed straight past the maximum, with no blur in between: a user who taps
 * Continue while still in the field never fires one, so the clamp cannot live
 * only there.
 */
it('clamps a height typed past the top of the range', async () => {
  await render(<AboutStep />)

  await user.type(screen.getByLabelText('HEIGHT'), '9')
  // 1649 while the cursor is in the field, then the clamp becomes visible on the
  // blur that `type` ends with — "show me what you understood".
  expect(screen.getByLabelText('HEIGHT')).toHaveDisplayValue('220')

  await continueOn()
  expect(saved()).toEqual(expect.objectContaining({ heightCm: 220 }))
})

/** The other end, which is the one that would produce a negative budget. */
it('clamps a height below the bottom of the range', async () => {
  seed({ heightCm: 40 })
  await render(<AboutStep />)
  await continueOn()

  expect(saved()).toEqual(expect.objectContaining({ heightCm: 120 }))
})

it('keeps the age the stepper is showing', async () => {
  await render(<AboutStep />)

  await user.press(screen.getByLabelText('Increase'))
  await user.press(screen.getByLabelText('Increase'))

  expect(saved().age).toBe(31)
})
