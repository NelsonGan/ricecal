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
 * What this suite is for: NOTHING ON THIS SCREEN IS ANSWERED FOR THE USER, and
 * the answers it does record are the ones on screen, recorded without touching
 * the network.
 *
 * All three halves have bitten. The screen used to write to `profiles` on every
 * interaction, which on the target weight slider is one request per frame of a
 * drag — `Slider` reports continuously — with the value that landed last decided
 * by whichever response came back last. It then used to open on a plausible
 * body — 164 cm, 65 kg, 29, female — and commit the lot on Continue, so a user
 * who tapped straight through got a calorie budget worked out for somebody else
 * with nothing on screen to say so. And the clamp cannot live on blur alone,
 * because a user who taps Continue from inside a field never fires one.
 *
 * Everything here types by appending, and nothing re-renders. `fireEvent.changeText`
 * against these fields leaves React's root unusable for the rest of the file —
 * every later render comes back empty — and `user.clear()` ends in a blur, which
 * is where a field is normalised. Seeding the store is how a test starts from an
 * answer already given, and it is the only way to arrange the target weight,
 * which is a drag.
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

/** Every question answered, for the tests that are about what happens next. */
const COMPLETE: OnboardingDraft = {
  heightCm: 170,
  weightKg: 65,
  age: 30,
  sex: 'female',
  targetWeightKg: 60,
}

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

const advance = () => screen.getByText('Continue')

const continueOn = async () => {
  await user.press(advance())
}

beforeEach(() => {
  jest.clearAllMocks()
  // The store outlives a render, which is the whole point of it — so each test
  // starts by emptying it rather than inheriting the last one's answers.
  store.clearAll()
})

it('opens with every field empty', async () => {
  await render(<AboutStep />)

  expect(screen.getByLabelText('HEIGHT')).toHaveDisplayValue('')
  expect(screen.getByLabelText('WEIGHT')).toHaveDisplayValue('')
  expect(screen.getByLabelText('AGE')).toHaveDisplayValue('')
  // The dash is the target weight's readout before it has been dragged. A
  // number there would be a goal nobody set.
  expect(screen.getByText('—')).toBeTruthy()
})

it('will not move on until every question is answered', async () => {
  await render(<AboutStep />)

  expect(advance()).toBeDisabled()

  await user.type(screen.getByLabelText('HEIGHT'), '170')
  await user.type(screen.getByLabelText('WEIGHT'), '65')
  await user.type(screen.getByLabelText('AGE'), '30')
  await user.press(screen.getByText('Female'))

  // Still held: the target weight is the one answer left, and it is the one a
  // user is most likely to walk past because the slider looks answered.
  expect(advance()).toBeDisabled()

  // A press on a disabled button does nothing at all, which is the behaviour
  // that matters — an incomplete draft reaching the flush leaves the budget
  // trigger with nothing to read and it gives up quietly.
  await continueOn()
  expect(mockPush).not.toHaveBeenCalled()
})

it('records every answer once they are all given', async () => {
  seed(COMPLETE)
  await render(<AboutStep />)
  await continueOn()

  expect(saved()).toEqual(
    expect.objectContaining({
      heightCm: 170,
      weightKg: 65,
      age: 30,
      sex: 'female',
      targetWeightKg: 60,
    }),
  )
  // Group-qualified: `activity` names two routes in this app, and a bare
  // `/activity` resolved to whichever expo-router picked.
  expect(mockPush).toHaveBeenCalledWith('/(onboarding)/activity')
})

it('shows the answers already given', async () => {
  seed({ heightCm: 178, weightKg: 80, age: 41 })
  await render(<AboutStep />)

  expect(screen.getByLabelText('HEIGHT')).toHaveDisplayValue('178')
  expect(screen.getByLabelText('WEIGHT')).toHaveDisplayValue('80')
  expect(screen.getByLabelText('AGE')).toHaveDisplayValue('41')
})

it('records what was typed', async () => {
  seed(COMPLETE)
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
  seed(COMPLETE)
  await render(<AboutStep />)

  await user.type(screen.getByLabelText('HEIGHT'), '9')
  // 1709 while the cursor is in the field, then the clamp becomes visible on the
  // blur that `type` ends with — "show me what you understood".
  expect(screen.getByLabelText('HEIGHT')).toHaveDisplayValue('220')

  await continueOn()
  expect(saved()).toEqual(expect.objectContaining({ heightCm: 220 }))
})

/** The other end, which is the one that would produce a negative budget. */
it('clamps a height below the bottom of the range', async () => {
  seed({ ...COMPLETE, heightCm: 40 })
  await render(<AboutStep />)
  await continueOn()

  expect(saved()).toEqual(expect.objectContaining({ heightCm: 120 }))
})
