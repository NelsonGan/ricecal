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
 * Nothing on this screen is answered for the user, and the answers it records are
 * the ones on screen, recorded without touching the network.
 *
 * All three have bitten. The screen wrote to `profiles` on every interaction,
 * which on the target weight slider is one request per frame of a drag. It opened
 * on a plausible body and committed the lot on Continue, so tapping straight
 * through gave a budget worked out for somebody else. And the clamp cannot live
 * on blur alone, because Continue from inside a field never fires one.
 *
 * Everything here types by appending. `fireEvent.changeText` against these fields
 * leaves React's root unusable for the rest of the file, and `user.clear()` ends
 * in a blur, which is where a field is normalised. Seeding the store is how a
 * test starts from an answer already given, and the only way to arrange the
 * target weight.
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

/**
 * IMPERIAL, which `setup` chooses one screen earlier.
 *
 * The database is centimetres and kilograms whatever this says, so every one of
 * these is really about the conversion at the edge: what a stored answer looks
 * like coming back into a field, and what a typed one becomes on the way to the
 * draft. The bounds are metric too, which is why a pounds field has to be
 * clamped against a converted limit rather than against 30.
 */
describe('imperial', () => {
  const IMPERIAL: OnboardingDraft = { ...COMPLETE, units: 'imperial' }

  it('asks for a height as feet and inches', async () => {
    seed({ units: 'imperial' })
    await render(<AboutStep />)

    expect(screen.getByLabelText('HEIGHT')).toHaveDisplayValue('')
    expect(screen.getByLabelText('INCHES')).toHaveDisplayValue('')
    // The centimetres field is not merely relabelled; it is not rendered.
    expect(screen.queryByDisplayValue('cm')).toBeNull()
  })

  it('shows a stored metric answer in the units it was asked for', async () => {
    seed(IMPERIAL)
    await render(<AboutStep />)

    // 170 cm is 5 feet 7; 65 kg is 143.3 lb.
    expect(screen.getByLabelText('HEIGHT')).toHaveDisplayValue('5')
    expect(screen.getByLabelText('INCHES')).toHaveDisplayValue('7')
    expect(screen.getByLabelText('WEIGHT')).toHaveDisplayValue('143.3')
  })

  it('stores what was typed as metric', async () => {
    seed({ units: 'imperial', sex: 'female', targetWeightKg: 60 })
    await render(<AboutStep />)

    await user.type(screen.getByLabelText('HEIGHT'), '5')
    await user.type(screen.getByLabelText('INCHES'), '10')
    await user.type(screen.getByLabelText('WEIGHT'), '160')
    await user.type(screen.getByLabelText('AGE'), '35')
    await continueOn()

    const draft = saved()
    // 5 feet 10 is 177.8 cm, 160 lb is 72.57 kg. Neither is rounded on the way
    // in: the rounding happens once, where it is displayed.
    expect(draft.heightCm).toBeCloseTo(177.8, 1)
    expect(draft.weightKg).toBeCloseTo(72.6, 1)
  })

  /**
   * A lone "5" in the feet box is 152 cm, which is a real height and would let
   * Continue go live halfway through typing one.
   */
  it('does not read half a height as an answer', async () => {
    seed({ units: 'imperial', sex: 'female', targetWeightKg: 60 })
    await render(<AboutStep />)

    await user.type(screen.getByLabelText('HEIGHT'), '5')
    await user.type(screen.getByLabelText('WEIGHT'), '160')
    await user.type(screen.getByLabelText('AGE'), '35')

    expect(advance()).toBeDisabled()
  })

  it('clamps a weight against the limit in the unit it was typed in', async () => {
    seed({ units: 'imperial', sex: 'female', targetWeightKg: 60 })
    await render(<AboutStep />)

    // 500 kg is the ceiling, which is 1,102.3 lb. A pounds field clamped against
    // 500 would refuse a weight well inside the range.
    await user.type(screen.getByLabelText('WEIGHT'), '600')
    expect(screen.getByLabelText('WEIGHT')).toHaveDisplayValue('600')
  })
})

/**
 * The ceilings, which both turned away real people at 200 kg and 100 years. Each
 * is inside its column's own check — `weight_logs.weight_kg` and the birth date
 * `profiles` derives from an age — so a value this screen accepts is one the
 * flush can write.
 */
describe('the top of each range', () => {
  it('accepts a weight up to half a tonne', async () => {
    seed(COMPLETE)
    await render(<AboutStep />)

    await user.type(screen.getByLabelText('WEIGHT'), '480')
    await continueOn()
    // 65 already in the field, appended to: 65480, clamped to the ceiling.
    expect(saved()).toEqual(expect.objectContaining({ weightKg: 500 }))
  })

  it('accepts an age a centenarian could give', async () => {
    seed({ ...COMPLETE, age: 104 })
    await render(<AboutStep />)

    expect(screen.getByLabelText('AGE')).toHaveDisplayValue('104')
    await continueOn()
    expect(saved()).toEqual(expect.objectContaining({ age: 104 }))
  })

  it('still clamps an age past the top', async () => {
    seed({ ...COMPLETE, age: 400 })
    await render(<AboutStep />)
    await continueOn()

    expect(saved()).toEqual(expect.objectContaining({ age: 150 }))
  })
})
