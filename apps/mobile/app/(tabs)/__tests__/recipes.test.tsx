import {
  act,
  fireEvent,
  render as rntlRender,
  screen,
  userEvent,
  waitFor,
  within,
} from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import type { Recipe } from '@/data'
import { clearRecipeRead, peekRecipeRead } from '@/features/recipes'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'
import RecipesTab from '../recipes'

const mockPush = jest.fn()
const mockUseRecipes = jest.fn()
const mockLog = jest.fn(() => Promise.resolve({ id: 'entry-1' }))
const mockRemoveEntry = jest.fn()
const mockRequirePro = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, canDismiss: () => false, replace: mockPush }),
}))

jest.mock('@/features/logging', () => {
  const { Pressable, Text } = jest.requireActual('react-native') as typeof import('react-native')
  return {
    InlineCamera: ({ onCapture }: { onCapture: (uri: string | undefined) => void }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Capture photo"
        onPress={() => onCapture('file:///recipe.jpg')}
      >
        <Text>Capture photo</Text>
      </Pressable>
    ),
  }
})

jest.mock('@/data', () => ({
  snapshotFromRecipe: (recipe: { name: string }) => ({ name: recipe.name }),
  storedImageSource: () => undefined,
  useLogFood: () => ({ mutateAsync: mockLog, isPending: false }),
  useMealPhotoUrl: () => ({ data: undefined, isLoading: false }),
  useRecipeQuota: () => ({ count: 4, limit: null, atLimit: false, loading: false }),
  useRecipes: (shelf: string, query: string) => mockUseRecipes(shelf, query),
  useRemoveEntry: () => ({ mutate: mockRemoveEntry }),
  useSelectedDate: () => ({ selectedDate: '2026-11-20', todayKey: '2026-11-21' }),
  useVideoImportQuota: () => ({ data: { used: 0, limit: 5, remaining: 5, entitled: false } }),
}))

jest.mock('@/data/refusals', () => ({
  openPaywall: jest.fn(),
  proFeatureTitle: () => '',
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
  clearRecipeRead()
  mockRequirePro.mockReturnValue(true)
  mockUseRecipes.mockReturnValue({ data: [RECIPE, QUICK], isPending: false })
})

/** Find the open sheet modal containing a heading. */
function findSheetModal(title: string) {
  const modal = screen
    .getAllByTestId('sheet-modal')
    .find((candidate) => within(candidate).queryByText(title))
  if (!modal) throw new Error(`Expected open sheet modal with title "${title}"`)
  return modal
}

/** Simulate iOS reporting that the sheet modal with `title` is on screen. */
async function finishShowing(title: string) {
  const modal = findSheetModal(title)
  await act(async () => {
    modal.props.onShow?.()
  })
  return modal
}

/** Simulate iOS reporting that a previously captured sheet modal finished dismissing. */
async function finishDismissing(modal: ReturnType<typeof screen.getByTestId>) {
  await act(async () => {
    modal.props.onDismiss?.()
  })
}

it('shows each recipe with its time and servings', async () => {
  await render(<RecipesTab />)

  expect(screen.getByText('Kari ayam')).toBeTruthy()
  expect(screen.getByText('1 h 10 min · 6 servings')).toBeTruthy()
  expect(screen.getByText('10 min · 1 serving')).toBeTruthy()
})

it('keeps the answer on screen while the same shelf refetches', async () => {
  mockUseRecipes.mockReturnValue({ data: [], isPending: false, isFetching: true })
  await render(<RecipesTab />)

  // An empty shelf of your own shows the empty state, not skeletons.
  expect(screen.getByText('No recipes yet')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Add a recipe' })).toBeTruthy()
})

it('shows no inline Add card over recipes and has no filter row', async () => {
  await render(<RecipesTab />)
  expect(screen.queryByText('Add a recipe')).toBeNull()
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
  )
})

async function openAddSheet() {
  await user.press(screen.getByRole('button', { name: 'New recipe' }))
  expect(await screen.findByText('Add a recipe')).toBeTruthy()
  return findSheetModal('Add a recipe')
}

it('opens the form directly when Write it is picked from the plus sheet', async () => {
  await render(<RecipesTab />)

  const addModal = await openAddSheet()
  await user.press(within(addModal).getByRole('button', { name: 'Write it' }))
  expect(mockPush).not.toHaveBeenCalled()

  await finishDismissing(addModal)
  expect(mockPush).toHaveBeenCalledWith('/recipe/edit')
})

it('chains plus sheet into Describe over the tab, stays on the tab on close, and hands off on submit', async () => {
  await render(<RecipesTab />)

  const firstAdd = await openAddSheet()
  await user.press(within(firstAdd).getByRole('button', { name: 'Describe' }))
  expect(screen.queryByText('Describe it')).toBeNull()
  await waitFor(() => expect(screen.queryByText('Add a recipe')).toBeNull())
  await finishDismissing(firstAdd)

  expect(mockRequirePro).toHaveBeenCalledWith('read_recipe')
  expect(await screen.findByText('Describe it')).toBeTruthy()
  const firstModal = await finishShowing('Describe it')
  expect(mockPush).not.toHaveBeenCalled()

  // Closing the sheet leaves the user on the Recipes tab with no navigation.
  await user.press(within(firstModal).getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(screen.queryByText('Describe it')).toBeNull())
  await finishDismissing(firstModal)
  expect(mockPush).not.toHaveBeenCalled()
  expect(screen.getByText('Kari ayam')).toBeTruthy()

  // Submitting stages the description and pushes `/recipe/edit?read=1` after dismissal.
  const secondAdd = await openAddSheet()
  await user.press(within(secondAdd).getByRole('button', { name: 'Describe' }))
  await waitFor(() => expect(screen.queryByText('Add a recipe')).toBeNull())
  await finishDismissing(secondAdd)
  expect(await screen.findByText('Describe it')).toBeTruthy()
  const secondModal = await finishShowing('Describe it')
  const field = await screen.findByPlaceholderText(/Kari ayam/)
  await fireEvent.changeText(field, 'Chicken curry, feeds four')
  await user.press(screen.getByRole('button', { name: 'Fill in the form' }))
  expect(mockPush).not.toHaveBeenCalled()

  await finishDismissing(secondModal)
  expect(peekRecipeRead()).toEqual({ kind: 'text', text: 'Chicken curry, feeds four' })
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/recipe/edit', params: { read: '1' } })
})

it('chains plus sheet into Photo over the tab, stays on the tab on close, and hands off a capture', async () => {
  await render(<RecipesTab />)

  const firstAdd = await openAddSheet()
  await user.press(within(firstAdd).getByRole('button', { name: 'Photo' }))
  await waitFor(() => expect(screen.queryByText('Add a recipe')).toBeNull())
  await finishDismissing(firstAdd)
  expect(mockRequirePro).toHaveBeenCalledWith('read_recipe')
  expect(await screen.findByText('Fill it in from a photo')).toBeTruthy()
  expect(mockPush).not.toHaveBeenCalled()

  // Closing the photo sheet returns directly to the Recipes tab with no navigation.
  const firstModal = findSheetModal('Fill it in from a photo')
  await user.press(within(firstModal).getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(screen.queryByText('Fill it in from a photo')).toBeNull())
  await finishDismissing(firstModal)
  expect(mockPush).not.toHaveBeenCalled()
  expect(screen.getByText('Kari ayam')).toBeTruthy()

  // Capturing stages the photo and opens `/recipe/edit?read=1` after dismissal.
  const secondAdd = await openAddSheet()
  await user.press(within(secondAdd).getByRole('button', { name: 'Photo' }))
  await waitFor(() => expect(screen.queryByText('Add a recipe')).toBeNull())
  await finishDismissing(secondAdd)
  expect(await screen.findByText('Fill it in from a photo')).toBeTruthy()
  const secondModal = findSheetModal('Fill it in from a photo')
  await user.press(within(secondModal).getByRole('button', { name: 'Capture photo' }))
  await finishDismissing(secondModal)
  expect(peekRecipeRead()).toEqual({ kind: 'photo', uri: 'file:///recipe.jpg' })
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/recipe/edit', params: { read: '1' } })
})

it('marks a recipe imported from a video with its platform, and only that one', async () => {
  mockUseRecipes.mockReturnValue({
    data: [
      {
        ...RECIPE,
        videoCredit: {
          platform: 'tiktok',
          author: '@cook',
          url: 'https://www.tiktok.com/@cook/video/1',
        },
      },
      QUICK,
    ],
    isPending: false,
  })
  await render(<RecipesTab />)

  expect(await screen.findByTestId('platform-logo-tiktok')).toBeTruthy()
  expect(screen.getAllByTestId(/^platform-logo-/)).toHaveLength(1)
  expect(screen.getByRole('button', { name: new RegExp(`^${RECIPE.name}, .*TikTok`) })).toBeTruthy()
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

it('opens the video sheet from the plus, not gated as Pro, and hands a pasted link to the import screen', async () => {
  await render(<RecipesTab />)

  const add = await openAddSheet()
  await user.press(within(add).getByRole('button', { name: 'Video' }))
  await waitFor(() => expect(screen.queryByText('Add a recipe')).toBeNull())
  await finishDismissing(add)

  // A free account imports five a month, so this tile is not a Pro gate.
  expect(mockRequirePro).not.toHaveBeenCalled()
  const sheet = await finishShowing('Import from a video')
  expect(screen.getByText('5 left this month')).toBeTruthy()

  // Not a link we read: the button stays off and the field says why.
  const field = screen.getByPlaceholderText('Paste a video link')
  await fireEvent.changeText(field, 'nasi lemak')
  expect(screen.getByText('That is not a link to a post we can read.')).toBeTruthy()

  // Every platform it reads, each as its logo and its name.
  for (const platform of [
    'instagram',
    'tiktok',
    'youtube',
    'x',
    'threads',
    'facebook',
    'rednote',
  ]) {
    expect(screen.getByTestId(`platform-logo-${platform}`)).toBeTruthy()
  }
  expect(
    screen.getByLabelText('Works with: Instagram, TikTok, YouTube, X, Threads, Facebook, Rednote'),
  ).toBeTruthy()

  await fireEvent.changeText(field, 'Look! https://www.instagram.com/reel/CnkNjXVsAJv/?igsh=x')
  // The pasted link's platform is the one picked out.
  expect(screen.getByTestId('works-with-instagram').props.accessibilityState).toMatchObject({
    selected: true,
  })
  expect(screen.getByTestId('works-with-tiktok').props.accessibilityState).toMatchObject({
    selected: false,
  })
  await user.press(screen.getByRole('button', { name: 'Import recipe' }))
  expect(mockPush).not.toHaveBeenCalled()

  await finishDismissing(sheet)
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/recipe/import',
    params: { url: 'https://www.instagram.com/reel/CnkNjXVsAJv/?igsh=x' },
  })
})
