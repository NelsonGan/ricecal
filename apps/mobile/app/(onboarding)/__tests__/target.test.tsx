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
import TargetStep from '../target'

/**
 * The budget, and the first screen in the flow where a number the app worked out
 * can be argued with.
 *
 * Two things are worth pinning. The figures have to reach the DRAFT, because the
 * screen after this one leaves the flow for `(auth)` and may come back to
 * `finish` rather than here — there is no unmount to hang a flush off. And a
 * budget that says what the formula says has to leave the draft EMPTY, or every
 * account would arrive flagged `is_custom` and never have its budget recomputed
 * again.
 */

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockDismissTo = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, dismissTo: mockDismissTo }),
}))

// No account yet, which is the whole reason this screen computes the budget
// itself rather than reading `current_daily_goals`.
jest.mock('@/data', () => ({ useSession: () => ({ session: null }) }))

/**
 * The ring, as the number in the middle of it.
 *
 * Skia's own jest setup does not mock `PathBuilder`, which `CalorieRing` calls
 * during render, and no other test in the repo draws one. Mocking the module
 * rather than the barrel it is re-exported from keeps every other `@/ui` import
 * on this screen real.
 */
jest.mock('@/ui/CalorieRing', () => {
  const { Text: RNText } = require('react-native')
  return {
    CalorieRing: ({ centerLabel }: { centerLabel: string }) => <RNText>{centerLabel}</RNText>,
  }
})

const store = createMMKV({ id: 'ricecal-onboarding' })
const seed = (draft: OnboardingDraft) => store.set('draft', JSON.stringify(draft))

/**
 * 164 cm, 65 kg, 29, sedentary, holding steady. The same body the nutrition
 * tests use, so the figures below trace to the ones asserted there: 1,640 kcal,
 * 203 g carbs, 104 g protein, 46 g fat.
 */
const BODY: OnboardingDraft = {
  units: 'metric',
  sex: 'female',
  age: 29,
  heightCm: 164,
  weightKg: 65,
  targetWeightKg: 65,
  activity: 'sedentary',
  referralSource: 'tiktok',
}

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

beforeEach(() => {
  jest.clearAllMocks()
  store.clearAll()
})

it('opens on the budget the formula asks for', async () => {
  seed(BODY)
  await render(<TargetStep />)

  expect(screen.getByLabelText('DAILY CALORIES')).toHaveDisplayValue('1640')
  expect(screen.getByLabelText('Protein')).toHaveDisplayValue('104')
  expect(screen.getByLabelText('Carbs')).toHaveDisplayValue('203')
  expect(screen.getByLabelText('Fat')).toHaveDisplayValue('46')
})

/**
 * Nothing in the draft while the figures are the formula's. Written eagerly, the
 * flush would flag every new account `is_custom` and the recompute trigger would
 * never touch their budget again — a weigh-in that moves nothing.
 */
it('records nothing while the budget is the formula', async () => {
  seed(BODY)
  await render(<TargetStep />)

  expect(saved().targets).toBeUndefined()
  expect(screen.queryByText('Use recommended')).toBeNull()
})

it('records a protein target the user typed', async () => {
  seed(BODY)
  await render(<TargetStep />)

  // Appended to the 104 already in the box, then cleared back to a real figure:
  // `user.type` appends, which is the only way these fields can be driven.
  await user.type(screen.getByLabelText('Protein'), '5')

  // 1045 is past nothing, so it is stored as typed.
  expect(saved().targets).toEqual({ kcal: 1640, carbs: 203, protein: 1045, fat: 46 })
})

it('says what the macros cost once they stop agreeing with the calories', async () => {
  seed(BODY)
  await render(<TargetStep />)

  await user.type(screen.getByLabelText('Protein'), '5')

  // 203*4 + 1045*4 + 46*9 = 5406.
  expect(screen.getByText('Macros add up to 5,406 kcal')).toBeTruthy()
})

it('opens on a budget already in the draft, and moves the ring with it', async () => {
  seed({ ...BODY, targets: { kcal: 1800, carbs: 203, protein: 104, fat: 46 } })
  await render(<TargetStep />)

  expect(screen.getByText('1,800')).toBeTruthy()

  // Appended to the 1,800 already in the box, which lands past the ceiling
  // `daily_goals.kcal` will store and is clamped to it.
  await user.type(screen.getByLabelText('DAILY CALORIES'), '0')

  expect(screen.getByText('10,000')).toBeTruthy()
  expect(saved().targets).toEqual({ kcal: 10_000, carbs: 203, protein: 104, fat: 46 })
})

/**
 * A box cleared and left is not a budget of nothing. `user.clear` ends in a blur,
 * which is where the figure comes back — the same "show me what you understood"
 * the height and weight fields on the `about` step make.
 */
it('puts a cleared figure back rather than reading it as zero', async () => {
  seed(BODY)
  await render(<TargetStep />)

  await user.clear(screen.getByLabelText('Protein'))

  expect(screen.getByLabelText('Protein')).toHaveDisplayValue('104')
  expect(saved().targets).toBeUndefined()
})

/**
 * The way back, and it has to leave the draft as it found it rather than storing
 * a copy of the formula's own answer.
 */
it('puts the budget back under the formula', async () => {
  seed(BODY)
  await render(<TargetStep />)

  await user.type(screen.getByLabelText('Protein'), '5')
  expect(saved().targets).toBeTruthy()

  await user.press(screen.getByText('Use recommended'))

  expect(screen.getByLabelText('Protein')).toHaveDisplayValue('104')
  expect(saved().targets).toBeUndefined()
})
