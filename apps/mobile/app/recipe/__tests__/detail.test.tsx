import { SafeAreaProvider } from 'react-native-safe-area-context'
import i18n from '@/i18n'

import { act, render, screen, userEvent, waitFor } from '@/test-utils'
import { ToastProvider } from '@/ui'
import RecipeDetailScreen from '../[id]'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockLeave = jest.fn()
const mockRemove = jest.fn(() => Promise.resolve())
const mockFavourite = jest.fn()
const mockIngredients = [
  {
    id: 'i1',
    name: 'Egg',
    amount: 2,
    unit: 'piece',
    perUnit: { kcal: 72, carbs: 0, protein: 6, fat: 5 },
    macros: { kcal: 144, carbs: 0, protein: 12, fat: 10 },
    position: 0,
  },
]

const mockRecipe: { current: Record<string, unknown> } = { current: {} }

const RECIPE = {
  id: 'recipe-1',
  name: 'Family Mart Egg Mayo Sandwich',
  icon: null,
  isMine: true,
  ownerId: 'me',
  authorName: null,
  photoPath: null,
  servings: 1,
  steps: 'Toast the bread.\nSpread the egg mayo.',
  tags: ['breakfast'],
  isFavourite: false,
  prepMinutes: 5,
  ingredientCount: 1,
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
  REPORT_REASONS: jest.requireActual('@/data/types').REPORT_REASONS,
  isRecipeLimit: () => false,
  snapshotFromRecipe: jest.fn(),
  storedImageSource: () => undefined,
  useBlockAuthor: () => ({ mutateAsync: jest.fn() }),
  useDeleteRecipe: () => ({ mutateAsync: mockRemove }),
  useFavouriteRecipe: () => ({ mutate: mockFavourite }),
  useLogFood: () => ({ mutateAsync: jest.fn(() => new Promise(() => {})), isPending: false }),
  useMealPhotoUrl: () => ({ data: undefined, isLoading: false }),
  useRecipe: () => ({ data: { ...RECIPE, ...mockRecipe.current }, isPending: false }),
  useRecipeIngredients: () => ({ data: mockIngredients }),
  useRecipeQuota: () => ({ atLimit: false }),
  useReportRecipe: () => ({ mutateAsync: jest.fn() }),
  useSaveRecipeCopy: () => ({ mutateAsync: jest.fn() }),
  useSelectedDate: () => ({ selectedDate: '2026-10-20' }),
}))

jest.mock('@/data/refusals', () => ({ openPaywall: jest.fn() }))
jest.mock('@/features/paywall', () => ({ useRequirePro: () => jest.fn(() => true) }))
jest.mock('@/features/recipes', () => ({
  ...jest.requireActual('@/features/recipes/recipeLanguage'),
  IngredientChecklist: () => null,
  RecipeNutrition: () => {
    const { Text } = jest.requireActual('react-native') as typeof import('react-native')
    return <Text>per serving</Text>
  },
  RecipeStats: () => null,
  LogRecipeSheet: ({ visible }: { visible: boolean }) => {
    const { Text } = jest.requireActual('react-native') as typeof import('react-native')
    return visible ? <Text>How much did you have?</Text> : null
  },
  RecipeSteps: () => null,
  sourceHost: (url: string) => url,
  splitSteps: jest.requireActual('@/features/recipes/RecipeSteps').splitSteps,
  ShareSheet: () => null,
  useCopyRecipe: () => ({ copy: jest.fn(), busy: false }),
  useRecipeLogDate: (date?: string) => ({ logDate: date ?? '2026-10-20', isToday: !date }),
  useTickedIngredients: () => [new Set(), jest.fn()],
}))
jest.mock('@/features/shared', () => ({ MealPhoto: () => null }))
jest.mock('@/lib/navigation', () => ({
  useBack: () => jest.fn(),
  useCloseStack: () => mockLeave,
}))

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
  await user.press(await screen.findByText('Delete recipe'))

  // Presenting the confirm while the menu is still dismissing is what iOS
  // silently drops, so it must wait for the menu's own dismissal.
  expect(screen.queryByText('Delete this recipe?')).toBeNull()

  await finishDismissing()
  expect(await screen.findByText('Delete this recipe?')).toBeOnTheScreen()

  await user.press(screen.getByText('Delete'))
  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith({ id: 'recipe-1', photoPath: null }))
  await finishDismissing()
  // Back to the Recipes tab underneath, not a second tab bar replacing this page.
  expect(mockLeave).toHaveBeenCalled()
  expect(mockReplace).not.toHaveBeenCalled()
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

it('stars your own recipe from the bar', async () => {
  const user = userEvent.setup()
  await renderScreen()

  await user.press(screen.getByLabelText('Favourite'))
  expect(mockFavourite).toHaveBeenCalledWith({ id: 'recipe-1', favourite: true })
})

it('starts cook mode at the number being cooked for', async () => {
  const user = userEvent.setup()
  await renderScreen()

  await user.press(screen.getByLabelText('Increase'))
  await user.press(screen.getByText('Cook'))
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/recipe/cook',
    params: { id: 'recipe-1', servings: '2' },
  })
})

it('asks how much was eaten before adding it to the day', async () => {
  const user = userEvent.setup()
  await renderScreen()

  await user.press(screen.getByText('Add to today'))
  expect(await screen.findByText('How much did you have?')).toBeOnTheScreen()
})

it('asks for ingredients rather than offering to log an empty recipe of your own', async () => {
  mockRecipe.current = { ingredientCount: 0 }
  const user = userEvent.setup()
  await renderScreen()

  expect(screen.queryByText('Add to today')).toBeNull()
  expect(screen.queryByText('per serving')).toBeNull()
  await user.press(screen.getByText('Add an ingredient'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/recipe/edit', params: { id: 'recipe-1' } })
  mockRecipe.current = {}
})

describe('a recipe imported in another language', () => {
  const translated = {
    translations: {
      'zh-Hans': { name: '鸡蛋三明治', ingredients: { Egg: '鸡蛋' } },
    },
  }

  afterEach(async () => {
    mockRecipe.current = {}
    await act(() => i18n.changeLanguage('en'))
  })

  it('is read in English, with no switch, by somebody whose app is in English', async () => {
    mockRecipe.current = translated
    await renderScreen()

    expect(screen.getByText('Family Mart Egg Mayo Sandwich')).toBeOnTheScreen()
    expect(screen.queryByText('中文')).toBeNull()
  })

  it('is read in the reader language, and switched back to English', async () => {
    mockRecipe.current = translated
    await act(() => i18n.changeLanguage('zh-Hans'))
    const user = userEvent.setup()
    await renderScreen()

    expect(screen.getByText('鸡蛋三明治')).toBeOnTheScreen()
    await user.press(screen.getByText('English'))
    expect(screen.getByText('Family Mart Egg Mayo Sandwich')).toBeOnTheScreen()
    await user.press(screen.getByText('中文'))
    expect(screen.getByText('鸡蛋三明治')).toBeOnTheScreen()
  })

  it('is read in English by a reader whose language it has not been translated into', async () => {
    mockRecipe.current = translated
    await act(() => i18n.changeLanguage('th'))
    await renderScreen()

    expect(screen.getByText('Family Mart Egg Mayo Sandwich')).toBeOnTheScreen()
    expect(screen.queryByText('English')).toBeNull()
  })
})
