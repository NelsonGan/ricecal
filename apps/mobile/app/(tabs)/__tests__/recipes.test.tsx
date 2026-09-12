import { render as rntlRender, screen, userEvent } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import type { Recipe } from '@/data'
import { ThemeProvider } from '@/theme/ThemeProvider'
import RecipesScreen from '../recipes'

const mockPush = jest.fn()
const mockUseRecipes = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/data', () => ({
  storedImageSource: () => undefined,
  useMealPhotoUrl: () => ({ data: undefined, isLoading: false }),
  useRecipeQuota: () => ({ count: 4, limit: null, atLimit: false, loading: false }),
  useRecipes: (shelf: string, query: string) => mockUseRecipes(shelf, query),
}))

jest.mock('@/features/paywall', () => ({
  useRequirePro: () => jest.fn().mockReturnValue(true),
}))

const RECIPE: Recipe = {
  id: 'r1',
  name: 'Ginger chicken rice with a deliberately long name',
  servings: 4,
  isMine: true,
  isPublic: false,
  review: 'pending',
  authorName: '',
  ownerId: 'u1',
  shareSlug: 'ginger-chicken-rice',
  savedCount: 0,
  ingredientCount: 3,
  total: { kcal: 2_208, carbs: 180, protein: 100, fat: 45 },
  perServing: { kcal: 552, carbs: 45, protein: 25, fat: 11.25 },
}

const RECIPES = Array.from({ length: 4 }, (_, index) => ({
  ...RECIPE,
  id: `r${index + 1}`,
  name: index === 0 ? RECIPE.name : `Food ${index + 1}`,
}))

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 852 },
        insets: { top: 59, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  )
}

const render = (ui: ReactElement) => rntlRender(ui, { wrapper: Providers })
const user = userEvent.setup()

beforeEach(() => {
  jest.clearAllMocks()
  mockUseRecipes.mockReturnValue({ data: RECIPES, isFetching: false })
})

it('opens search only on demand and keeps its field focused', async () => {
  await render(<RecipesScreen />)

  expect(screen.queryByPlaceholderText('Search my foods')).toBeNull()
  await user.press(screen.getByRole('button', { name: 'Search my foods' }))

  expect(screen.getByPlaceholderText('Search my foods')).toHaveProp('autoFocus', true)
})

it('uses the short Community heading on the shared shelf', async () => {
  await render(<RecipesScreen />)

  await user.press(screen.getByRole('tab', { name: 'Community' }))

  // Once in the segment and once as the screen heading. The old heading added
  // "From the" and would leave only the segment matching this text.
  expect(screen.getAllByText('Community')).toHaveLength(2)
})

it('keeps an incomplete row in the three-column grid', async () => {
  await render(<RecipesScreen />)

  expect(screen.getAllByRole('button', { name: /kcal/ })).toHaveLength(4)
  expect(screen.getAllByTestId('recipe-grid-filler')).toHaveLength(2)
  expect(screen.getByText(RECIPE.name)).toHaveProp('numberOfLines', 2)
  expect(screen.queryByText('4 servings')).toBeNull()
})
