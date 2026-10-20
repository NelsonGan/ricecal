import '@/i18n'

import { SafeAreaProvider } from 'react-native-safe-area-context'

import { act, render, screen, userEvent, waitFor } from '@/test-utils'
import { ToastProvider } from '@/ui'
import RecipeDetailScreen from '../[id]'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockRemove = jest.fn(() => Promise.resolve())

const RECIPE = {
  id: 'recipe-1',
  name: 'Family Mart Egg Mayo Sandwich',
  icon: null,
  isMine: true,
  ownerId: 'me',
  authorName: null,
  photoPath: null,
  servings: 1,
  steps: [],
  perServing: { kcal: 217, carbs: 25.8, protein: 11.2, fat: 7.7 },
}

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'recipe-1' }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))

jest.mock('@/data', () => ({
  isRecipeLimit: () => false,
  snapshotFromRecipe: jest.fn(),
  storedImageSource: () => undefined,
  useBlockAuthor: () => ({ mutateAsync: jest.fn() }),
  useDeleteRecipe: () => ({ mutateAsync: mockRemove }),
  useLogFood: () => ({ mutate: jest.fn(), isPending: false }),
  useMealPhotoUrl: () => ({ data: undefined, isLoading: false }),
  useRecipe: () => ({ data: RECIPE, isPending: false }),
  useRecipeIngredients: () => ({ data: [] }),
  useRecipeQuota: () => ({ atLimit: false }),
  useReportRecipe: () => ({ mutateAsync: jest.fn() }),
  useSaveRecipeCopy: () => ({ mutateAsync: jest.fn() }),
  useSelectedDate: () => ({ selectedDate: '2026-10-20' }),
}))

jest.mock('@/data/refusals', () => ({ openPaywall: jest.fn() }))
jest.mock('@/features/paywall', () => ({ useRequirePro: () => jest.fn(() => true) }))
jest.mock('@/features/recipes', () => ({ RecipeSteps: () => null, ShareSheet: () => null }))
jest.mock('@/features/shared', () => ({ MealPhoto: () => null }))
jest.mock('@/lib/navigation', () => ({ useBack: () => jest.fn() }))

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ToastProvider>
        <RecipeDetailScreen />
      </ToastProvider>
    </SafeAreaProvider>,
  )
}

/** What iOS reports once the closing menu's native window is actually gone. */
async function finishDismissing() {
  await act(async () => {
    for (const modal of screen.getAllByTestId('sheet-modal')) modal.props.onDismiss?.()
  })
}

it('asks to delete only once the menu has finished closing', async () => {
  const user = userEvent.setup()
  await renderScreen()

  await user.press(screen.getByLabelText('More options'))
  await user.press(await screen.findByText('Delete food'))

  // Presenting the confirm while the menu is still dismissing is what iOS
  // silently drops, so it must wait for the menu's own dismissal.
  expect(screen.queryByText('Delete this food?')).toBeNull()

  await finishDismissing()
  expect(await screen.findByText('Delete this food?')).toBeOnTheScreen()

  await user.press(screen.getByText('Delete'))
  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith({ id: 'recipe-1', photoPath: null }))
  expect(mockReplace).toHaveBeenCalledWith('/settings/foods')
})

it('opens the editor once the menu has finished closing', async () => {
  const user = userEvent.setup()
  await renderScreen()

  await user.press(screen.getByLabelText('More options'))
  await user.press(await screen.findByText('Edit'))
  expect(mockPush).not.toHaveBeenCalled()

  await finishDismissing()
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/recipe/edit', params: { id: 'recipe-1' } })
})
