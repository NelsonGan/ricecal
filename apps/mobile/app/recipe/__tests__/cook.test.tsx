import '@/i18n'

import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useTickedIngredients } from '@/features/recipes'
import { render, screen, userEvent } from '@/test-utils'
import { ToastProvider } from '@/ui'
import CookModeScreen from '../cook'

const mockBack = jest.fn()
const mockLog = jest.fn((_input: unknown) => new Promise(() => {}))
const mockUpload = jest.fn((_uri: string) => Promise.resolve('meals/u/plate.jpg'))
const mockRemovePhoto = jest.fn((_path: string) => Promise.resolve())
const mockReplace = jest.fn()
const mockRecipe: { current: Record<string, unknown> } = { current: {} }

const mockKari = {
  id: 'kari',
  name: 'Kari ayam',
  icon: undefined,
  isMine: true,
  servings: 4,
  steps: 'Blend the paste.\nAdd the chicken and fry.\nSimmer for 20 minutes.',
  ingredientCount: 1,
  perServing: { kcal: 500, carbs: 10, protein: 30, fat: 20 },
}

const mockIngredients = [
  {
    id: 'i1',
    name: 'Chicken thigh',
    amount: 600,
    unit: 'g',
    perUnit: { kcal: 2, carbs: 0, protein: 0.2, fat: 0.1 },
    macros: { kcal: 1200, carbs: 0, protein: 120, fat: 60 },
    position: 0,
  },
]

jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }))
jest.mock('expo-router', () => ({
  // `route` stands in for a share slug: the recipe was opened from a link.
  useLocalSearchParams: () => ({
    id: mockRecipe.current.route ?? mockRecipe.current.id ?? 'kari',
    servings: '2',
  }),
  useRouter: () => ({ replace: mockReplace }),
}))
jest.mock('@/lib/navigation', () => ({ useBack: () => mockBack, useCloseStack: () => mockBack }))
jest.mock('@/data', () => ({
  removeMealPhoto: (path: string) => mockRemovePhoto(path),
  uploadMealPhoto: (uri: string) => mockUpload(uri),
  useLogFood: () => ({ mutateAsync: mockLog, isPending: false }),
  useRecipe: () => ({ data: { ...mockKari, ...mockRecipe.current }, isPending: false }),
  useRecipeIngredients: () => ({ data: mockIngredients }),
  useRemoveEntry: () => ({ mutate: jest.fn() }),
  useSelectedDate: () => ({ selectedDate: '2026-11-21', todayKey: '2026-11-21' }),
}))

// The viewfinder needs a camera; a button that hands back a shot stands in.
jest.mock('@/features/logging', () => {
  const { Pressable, Text } = jest.requireActual('react-native')
  return {
    ...jest.requireActual('@/features/logging'),
    InlineCamera: ({ onCapture }: { onCapture: (uri: string, from: string) => void }) => (
      <Pressable onPress={() => onCapture('file:///plate.jpg', 'camera')}>
        <Text>Shutter</Text>
      </Pressable>
    ),
  }
})

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ToastProvider>
        <CookModeScreen />
      </ToastProvider>
    </SafeAreaProvider>,
  )
}

// The step is remembered per recipe for the life of the app, so each test
// cooks a recipe of its own.
let nextId = 0
beforeEach(() => {
  mockRecipe.current = { id: `pot-${nextId++}` }
  jest.clearAllMocks()
})

it('moves on when the step itself is tapped, and shows what it needs at tonight’s amounts', async () => {
  const user = userEvent.setup()
  await renderScreen()

  expect(screen.getByText('Blend the paste.')).toBeOnTheScreen()
  await user.press(screen.getByText('Blend the paste.'))
  expect(screen.getByText('Add the chicken and fry.')).toBeOnTheScreen()
  // Written for 4, cooked for 2.
  expect(screen.getByText('Chicken thigh')).toBeOnTheScreen()
  expect(screen.getByText('300 g')).toBeOnTheScreen()
})

it('remembers the step after leaving and coming back', async () => {
  const user = userEvent.setup()
  const first = await renderScreen()
  await user.press(screen.getByText('Next step'))
  await user.press(screen.getByText('Next step'))
  await first.unmount()

  await renderScreen()
  expect(screen.getByText('Simmer for 20 minutes.')).toBeOnTheScreen()
})

it('asks how much was eaten at the end, and starts over next time', async () => {
  const user = userEvent.setup()
  const first = await renderScreen()

  await user.press(screen.getByText('Next step'))
  await user.press(screen.getByText('Next step'))
  await user.press(screen.getByText('Done'))
  expect(screen.getByText('Enjoy your meal')).toBeOnTheScreen()
  await user.press(screen.getByText('Add to today'))
  expect(await screen.findByText('How much did you have?')).toBeOnTheScreen()
  await first.unmount()

  await renderScreen()
  expect(screen.getByText('Blend the paste.')).toBeOnTheScreen()
})

it('offers no log for a recipe with nothing in it', async () => {
  mockRecipe.current = { id: 'empty', ingredientCount: 0 }
  const user = userEvent.setup()
  await renderScreen()

  await user.press(screen.getByText('Next step'))
  await user.press(screen.getByText('Next step'))
  await user.press(screen.getByText('Done'))
  expect(screen.queryByText('Add to today')).toBeNull()
  await user.press(screen.getByText('Add an ingredient'))
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/recipe/edit', params: { id: 'empty' } })
})

it('keeps the ticks from the recipe page when the recipe was opened from a share link', async () => {
  // The recipe page files ticks under the row id (`recipe?.id ?? id`) and
  // opens cook mode with the route's id, which for a shared link is the slug.
  const rowId = mockRecipe.current.id as string
  mockRecipe.current = { id: rowId, route: 'Ab3dEf7hJk' }
  function TickOnRecipePage() {
    const [, toggle] = useTickedIngredients(rowId)
    // biome-ignore lint/correctness/useExhaustiveDependencies: once, as a tap would
    useEffect(() => toggle('i1'), [])
    return null
  }
  await render(<TickOnRecipePage />)

  const user = userEvent.setup()
  await renderScreen()
  await user.press(screen.getByText('Blend the paste.'))
  expect(screen.getByRole('checkbox', { name: /Chicken thigh/ })).toBeChecked()

  // And finishing clears them under the same key, so the page starts clean.
  await user.press(screen.getByText('Next step'))
  await user.press(screen.getByText('Done'))
  const after: { ticks: ReadonlySet<string> | null } = { ticks: null }
  function ReadRecipePage() {
    after.ticks = useTickedIngredients(rowId)[0]
    return null
  }
  await render(<ReadRecipePage />)
  expect(after.ticks?.size).toBe(0)
})

async function finishCooking(user: ReturnType<typeof userEvent.setup>) {
  await user.press(screen.getByText('Next step'))
  await user.press(screen.getByText('Next step'))
  await user.press(screen.getByText('Done'))
}

it('puts a photo of the plate on the diary entry', async () => {
  const user = userEvent.setup()
  await renderScreen()
  await finishCooking(user)

  expect(screen.getByText('Snap your plate to log it with a photo.')).toBeOnTheScreen()
  await user.press(screen.getByText('Take a photo'))
  await user.press(await screen.findByText('Shutter'))
  expect(await screen.findByText('Retake')).toBeOnTheScreen()
  expect(mockUpload).toHaveBeenCalledWith('file:///plate.jpg')

  await user.press(screen.getByText('Add to today'))
  await screen.findByText('How much did you have?')
  // The sheet's own button, which comes ahead of the footer's in the tree.
  await user.press(screen.getAllByText('Add to today')[0])
  expect(mockLog).toHaveBeenCalledWith(
    expect.objectContaining({ photoPath: 'meals/u/plate.jpg', method: 'recipe' }),
  )
})

it('deletes the photo when the cook leaves without logging it', async () => {
  const user = userEvent.setup()
  const view = await renderScreen()
  await finishCooking(user)
  await user.press(screen.getByText('Take a photo'))
  await user.press(await screen.findByText('Shutter'))
  await screen.findByText('Retake')

  await view.unmount()
  expect(mockRemovePhoto).toHaveBeenCalledWith('meals/u/plate.jpg')
})

it('keeps the photo once the entry is being written', async () => {
  const user = userEvent.setup()
  const view = await renderScreen()
  await finishCooking(user)
  await user.press(screen.getByText('Take a photo'))
  await user.press(await screen.findByText('Shutter'))
  await screen.findByText('Retake')
  await user.press(screen.getByText('Add to today'))
  await screen.findByText('How much did you have?')
  await user.press(screen.getAllByText('Add to today')[0])

  await view.unmount()
  expect(mockRemovePhoto).not.toHaveBeenCalled()
})
