import '@/i18n'

import { SafeAreaProvider } from 'react-native-safe-area-context'

import { render, screen, userEvent } from '@/test-utils'
import { ToastProvider } from '@/ui'
import CookModeScreen from '../cook'

const mockBack = jest.fn()
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
  useLocalSearchParams: () => ({ id: mockRecipe.current.id ?? 'kari', servings: '2' }),
  useRouter: () => ({ replace: mockReplace }),
}))
jest.mock('@/lib/navigation', () => ({ useBack: () => mockBack }))
jest.mock('@/data', () => ({
  useLogFood: () => ({ mutate: jest.fn(), isPending: false }),
  useRecipe: () => ({ data: { ...mockKari, ...mockRecipe.current }, isPending: false }),
  useRecipeIngredients: () => ({ data: mockIngredients }),
  useRemoveEntry: () => ({ mutate: jest.fn() }),
  useSelectedDate: () => ({ selectedDate: '2026-11-21', todayKey: '2026-11-21' }),
}))

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
