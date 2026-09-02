import { render as rntlRender, screen, userEvent } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'
import GoalsScreen from '../goals'

/**
 * Goals and targets: four figures somebody can type over, and one flag that
 * decides whether the database ever computes them again.
 *
 * `daily_goals.is_custom` stops the recompute trigger permanently, so the bug
 * this file exists for is a save that sets it for nothing. Opening this screen,
 * changing the water goal and pressing Save must leave an automatic budget
 * automatic; typing a protein target must not.
 */

const mockSetTargets = jest.fn().mockResolvedValue({})
const mockUpdateProfile = jest.fn().mockResolvedValue({})
const mockUpdateSettings = jest.fn().mockResolvedValue({})

/**
 * 164 cm, 65 kg, 29, sedentary, holding steady — the body the nutrition tests
 * use, so the formula's answer here is the 1,640/203/104/46 asserted there.
 */
const mockProfile = {
  sex: 'female',
  birth_date: '1997-01-01',
  height_cm: 164,
  target_weight_kg: 65,
  activity_level: 'sedentary',
}

/** What `useTargets` answers with. Overwritten per test. */
let mockStored = { kcal: 1640, carbs: 203, protein: 104, fat: 46, waterMl: 2000, isCustom: false }

/**
 * The whole data layer, because `@/data` builds the Supabase client at import
 * time. `bodyFrom` is restated rather than required through: the real one lives
 * in `data/profile.ts` beside every hook this is replacing.
 */
jest.mock('@/data', () => {
  return {
    bodyFrom: (
      profile: typeof mockProfile,
      weightKg: number,
      overrides?: { targetWeightKg?: number | null },
    ) => ({
      sex: profile.sex,
      weightKg,
      heightCm: profile.height_cm,
      age: 29,
      activity: 'sedentary',
      targetWeightKg:
        overrides?.targetWeightKg !== undefined
          ? overrides.targetWeightKg
          : profile.target_weight_kg,
    }),
    useProfile: () => ({ data: mockProfile, isPending: false }),
    useTargets: () => ({ data: mockStored, isPending: false }),
    useSettings: () => ({ data: { units: 'metric', step_goal: 8000 }, isPending: false }),
    useWeighIns: () => ({ isPending: false }),
    useCurrentWeight: () => 65,
    useUpdateProfile: () => ({ mutateAsync: mockUpdateProfile }),
    useUpdateSettings: () => ({ mutateAsync: mockUpdateSettings }),
    useSetTargets: () => ({ mutateAsync: mockSetTargets }),
  }
})

jest.mock('@/lib/navigation', () => ({ useBack: () => jest.fn() }))

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

const render = (ui: ReactElement) => rntlRender(ui, { wrapper: Providers })
const user = userEvent.setup()

const save = async () => {
  await user.press(screen.getByText('Save changes'))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockStored = { kcal: 1640, carbs: 203, protein: 104, fat: 46, waterMl: 2000, isCustom: false }
})

it('names the recommendation in the calorie box rather than under it', async () => {
  await render(<GoalsScreen />)

  // The placeholder is where it is read. It was a caption below the field as
  // well, printing the same figure the field already held.
  expect(screen.getByPlaceholderText('Recommended 1,640')).toBeTruthy()
  expect(screen.queryByText('Recommended 1,640')).toBeNull()
})

/**
 * The regression the blur settle introduced and this pins shut. `is_custom`
 * stops the database recomputing for good, and tapping into a field and out
 * again is not a budget somebody set.
 */
it('does not freeze the budget for a field that was focused and left alone', async () => {
  // A stored budget that does NOT match what the formula now asks for, which is
  // the state every account whose protein target predates the adjusted basis
  // opens this screen in. Matching figures would pass either way.
  mockStored = { ...mockStored, protein: 130, isCustom: false }
  await render(<GoalsScreen />)

  // Typing nothing still focuses the field and blurs it on the way out, which is
  // the whole of the interaction being pinned. `fireEvent` would do it too and
  // leaves React's root unusable for the rest of the file — see the note at the
  // top of the `about` step's tests.
  await user.type(screen.getByLabelText('Protein'), '')
  await save()

  expect(mockSetTargets).toHaveBeenCalledWith(
    expect.objectContaining({ protein: 130, isCustom: false }),
  )
})

/**
 * The same rule, one step further in: a box cleared and left is put back by the
 * blur, which lands on a budget identical to the stored one. Identical is not
 * edited, however many events it took to get there.
 */
it('does not freeze the budget for a figure cleared and restored', async () => {
  mockStored = { ...mockStored, protein: 130, isCustom: false }
  await render(<GoalsScreen />)

  await user.clear(screen.getByLabelText('Protein'))
  expect(screen.getByLabelText('Protein')).toHaveDisplayValue('130')

  await save()
  expect(mockSetTargets).toHaveBeenCalledWith(
    expect.objectContaining({ protein: 130, isCustom: false }),
  )
})

/** The other half of the settle: a figure outside the range comes back visibly. */
it('shows what it understood when a figure lands outside the range', async () => {
  await render(<GoalsScreen />)

  // Appended to the 1,640 already there, which lands past the ceiling
  // `daily_goals.kcal` will store. `user.type` ends in a blur, which is where
  // the clamp becomes visible rather than the save quietly writing a different
  // number.
  await user.type(screen.getByLabelText('DAILY CALORIES'), '0')

  expect(screen.getByLabelText('DAILY CALORIES')).toHaveDisplayValue('10000')
})

it('shows the stored budget in four boxes', async () => {
  mockStored = { ...mockStored, protein: 150, isCustom: true }
  await render(<GoalsScreen />)

  expect(screen.getByLabelText('DAILY CALORIES')).toHaveDisplayValue('1640')
  expect(screen.getByLabelText('Protein')).toHaveDisplayValue('150')
})

/**
 * The regression. A pass through this screen that touched nothing used to write
 * `is_custom: true`, which froze the user's budget for the life of the account.
 */
it('leaves an automatic budget automatic when nothing was typed', async () => {
  await render(<GoalsScreen />)
  await save()

  expect(mockSetTargets).toHaveBeenCalledWith(
    expect.objectContaining({ kcal: 1640, protein: 104, isCustom: false }),
  )
  // Nothing moved, so the profile is not written either: the write itself is
  // what fires the recompute trigger.
  expect(mockUpdateProfile).not.toHaveBeenCalled()
})

it('saves a protein target the user typed, and flags it custom', async () => {
  await render(<GoalsScreen />)

  // Appended to the 104 already in the box.
  await user.type(screen.getByLabelText('Protein'), '5')
  await save()

  expect(mockSetTargets).toHaveBeenCalledWith(
    expect.objectContaining({ kcal: 1640, carbs: 203, protein: 1045, fat: 46, isCustom: true }),
  )
})

/**
 * The macros used to be a read-only list drawn from the STORED row beside a
 * calorie slider that had already moved, so the card contradicted itself.
 */
it('says what the macros add up to once they leave the calorie figure', async () => {
  await render(<GoalsScreen />)

  await user.type(screen.getByLabelText('Protein'), '5')

  expect(screen.getByText('Macros add up to 5,406 kcal')).toBeTruthy()
})

/** Typing a figure and putting it back is not a hand-set budget. */
it('takes the budget back off the user when the recommendation is restored', async () => {
  await render(<GoalsScreen />)

  await user.type(screen.getByLabelText('Protein'), '5')
  await user.press(screen.getByText('Use recommended'))
  await save()

  expect(mockSetTargets).toHaveBeenCalledWith(
    expect.objectContaining({ protein: 104, isCustom: false }),
  )
})

/**
 * A hand-set budget belonging to somebody who came in for the water goal. It has
 * to survive a save that never touched it.
 */
it('keeps a stored custom budget through a save that did not touch it', async () => {
  mockStored = { ...mockStored, kcal: 1800, protein: 150, isCustom: true }
  await render(<GoalsScreen />)
  await save()

  expect(mockSetTargets).toHaveBeenCalledWith(
    expect.objectContaining({ kcal: 1800, protein: 150, isCustom: true }),
  )
})
