import { render as rntlRender, screen, userEvent } from '@testing-library/react-native'
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
const mockRequirePro = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, canDismiss: () => false, replace: mockPush }),
}))

jest.mock('@/data', () => ({
  RECIPE_TAGS: ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'drink'],
  snapshotFromRecipe: (recipe: { name: string }) => ({ name: recipe.name }),
  storedImageSource: () => undefined,
  useLogFood: () => ({ mutate: mockLog, isPending: false }),
  useMealPhotoUrl: () => ({ data: undefined, isLoading: false }),
  useRecipeQuota: () => ({ count: 4, limit: null, atLimit: false, loading: false }),
  useRecipes: (shelf: string, query: string, filter: unknown) =>
    mockUseRecipes(shelf, query, filter),
  useSelectedDate: () => ({ selectedDate: '2026-11-21' }),
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
  mockUseRecipes.mockReturnValue({ data: [RECIPE, QUICK], isFetching: false })
})

it('shows each recipe with its time and servings', async () => {
  await render(<RecipesTab />)

  expect(screen.getByText('Kari ayam')).toBeTruthy()
  expect(screen.getByText('1 h 10 min · 6 servings')).toBeTruthy()
  expect(screen.getByText('10 min · 1 serving')).toBeTruthy()
})

it('narrows by meal on the server and by time on the phone', async () => {
  await render(<RecipesTab />)

  await user.press(screen.getByRole('button', { name: 'Dinner' }))
  expect(mockUseRecipes).toHaveBeenLastCalledWith('mine', '', { tag: 'dinner' })

  await user.press(screen.getByRole('button', { name: 'Under 30 min' }))
  expect(mockUseRecipes).toHaveBeenLastCalledWith('mine', '', {})
  expect(screen.queryByText('Kari ayam')).toBeNull()
  expect(screen.getByText('Telur dadar')).toBeTruthy()
})

it('offers favourites on your own shelf only', async () => {
  await render(<RecipesTab />)
  expect(screen.getByRole('button', { name: 'Favourites' })).toBeTruthy()

  await user.press(screen.getByRole('tab', { name: 'Community' }))
  expect(screen.queryByRole('button', { name: 'Favourites' })).toBeNull()
  expect(screen.queryByText('Add a recipe')).toBeNull()
})

it('logs one serving from the card', async () => {
  await render(<RecipesTab />)

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
