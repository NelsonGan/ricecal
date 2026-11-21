import { fireEvent, render as rntlRender, screen, userEvent } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import type { Recipe } from '@/data'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'
import RecipesTab from '../recipes'

const mockPush = jest.fn()
const mockUseRecipes = jest.fn()
const mockLog = jest.fn()
const mockRemoveEntry = jest.fn()
const mockRequirePro = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, canDismiss: () => false, replace: mockPush }),
}))

jest.mock('@/data', () => ({
  snapshotFromRecipe: (recipe: { name: string }) => ({ name: recipe.name }),
  storedImageSource: () => undefined,
  useLogFood: () => ({ mutate: mockLog, isPending: false }),
  useMealPhotoUrl: () => ({ data: undefined, isLoading: false }),
  useRecipeQuota: () => ({ count: 4, limit: null, atLimit: false, loading: false }),
  useRecipes: (shelf: string, query: string) => mockUseRecipes(shelf, query),
  useRemoveEntry: () => ({ mutate: mockRemoveEntry }),
  useSelectedDate: () => ({ selectedDate: '2026-11-20', todayKey: '2026-11-21' }),
}))

jest.mock('@/features/paywall', () => ({
  useRequirePro: () => mockRequirePro,
}))

const RECIPE: Recipe = {
  id: 'r1',
  name: 'Kari ayam',
  servings: 6,
  isMine: true,
  isPublic: false,
  review: 'pending',
  authorName: '',
  ownerId: 'u1',
  shareSlug: 'slug',
  savedCount: 0,
  ingredientCount: 3,
  total: { kcal: 3_072, carbs: 180, protein: 100, fat: 45 },
  perServing: { kcal: 512, carbs: 30, protein: 17, fat: 8 },
  prepMinutes: 20,
  cookMinutes: 50,
  tags: ['dinner'],
  isFavourite: true,
}

const QUICK: Recipe = {
  ...RECIPE,
  id: 'r2',
  name: 'Telur dadar',
  servings: 1,
  prepMinutes: 5,
  cookMinutes: 5,
  tags: ['breakfast'],
  isFavourite: false,
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 852 },
        insets: { top: 59, left: 0, right: 0, bottom: 34 },
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

beforeEach(() => {
  jest.clearAllMocks()
  mockRequirePro.mockReturnValue(true)
  mockUseRecipes.mockReturnValue({ data: [RECIPE, QUICK], isPending: false })
})

it('shows each recipe with its time and servings', async () => {
  await render(<RecipesTab />)

  expect(screen.getByText('Kari ayam')).toBeTruthy()
  expect(screen.getByText('1 h 10 min · 6 servings')).toBeTruthy()
  expect(screen.getByText('10 min · 1 serving')).toBeTruthy()
})

it('keeps the answer on screen while the same shelf refetches', async () => {
  mockUseRecipes.mockReturnValue({ data: [], isPending: false, isFetching: true })
  await render(<RecipesTab />)

  // An empty shelf of your own is the Add card, not skeletons.
  expect(screen.getByText('Add a recipe')).toBeTruthy()
})

it('steps the Add card aside once the shelf has a few recipes', async () => {
  mockUseRecipes.mockReturnValue({
    data: [1, 2, 3, 4].map((n) => ({ ...RECIPE, id: `r${n}`, name: `Recipe ${n}` })),
    isPending: false,
  })
  await render(<RecipesTab />)

  expect(screen.queryByText('Add a recipe')).toBeNull()
})

it('keeps the Add card to your own shelf, and has no filter row', async () => {
  await render(<RecipesTab />)
  expect(screen.getByText('Add a recipe')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Favourites' })).toBeNull()

  await user.press(screen.getByRole('tab', { name: 'Community' }))
  expect(screen.queryByText('Add a recipe')).toBeNull()
  expect(mockUseRecipes).toHaveBeenLastCalledWith('community', '')
})

it('logs one serving from the card into today, not the day the diary is on', async () => {
  await render(<RecipesTab />)
  // The plus sits under the photo, so it waits for the photo's height.
  for (const photo of screen.getAllByTestId('recipe-card-photo')) {
    await fireEvent(photo, 'layout', { nativeEvent: { layout: { height: 120 } } })
  }

  await user.press(screen.getByRole('button', { name: 'Add Kari ayam to today' }))
  expect(mockLog).toHaveBeenCalledWith(
    expect.objectContaining({ quantity: 1, logDate: '2026-11-21', method: 'recipe' }),
    expect.anything(),
  )
})

it('opens the form at the door that was picked', async () => {
  await render(<RecipesTab />)

  await user.press(screen.getByRole('button', { name: 'Describe' }))
  expect(mockRequirePro).toHaveBeenCalledWith('read_recipe')
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/recipe/edit',
    params: { start: 'describe' },
  })
})

it('shows no price and no quick log on a recipe with nothing in it yet', async () => {
  mockUseRecipes.mockReturnValue({
    data: [{ ...QUICK, ingredientCount: 0, perServing: { kcal: 0, carbs: 0, protein: 0, fat: 0 } }],
    isPending: false,
  })
  await render(<RecipesTab />)

  expect(screen.queryByText('0 kcal')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Add Telur dadar to today' })).toBeNull()
})
