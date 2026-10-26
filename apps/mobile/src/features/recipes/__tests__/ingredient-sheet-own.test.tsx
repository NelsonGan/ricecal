import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { fireEvent, render, screen, userEvent } from '@/test-utils'
import { IngredientSheet } from '../IngredientSheet'

/**
 * The cook's own ingredient is added only with figures the database can store,
 * read the way they were typed and priced against the amount actually kept.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/data', () => {
  const recipes = jest.requireActual('@/data/recipes')
  return {
    isStorableAmount: recipes.isStorableAmount,
    isStorablePerUnit: recipes.isStorablePerUnit,
    storedAmount: recipes.storedAmount,
    useFood: () => ({ data: undefined, isPending: false }),
    useFoodSearch: () => ({ data: [], isPending: false, isFetching: false }),
  }
})

const onAdd = jest.fn()
// userEvent rather than fireEvent for presses: it honours `disabled`.
const user = userEvent.setup()

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

async function openOwnPanel() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <IngredientSheet visible onClose={jest.fn()} onAdd={onAdd} />
    </SafeAreaProvider>,
  )
  await user.press(screen.getByLabelText('Add your own ingredient'))
}

function fill(label: string, text: string) {
  return fireEvent.changeText(screen.getByLabelText(label), text)
}

const add = () => screen.getByText('Add to the pot')

beforeEach(() => onAdd.mockClear())

it('reads a comma as the decimal point', async () => {
  await openOwnPanel()
  await fill('NAME', 'Santan')
  await fill('PORTION', '2,5')
  await fill('CALORIES', '50')
  await user.press(add())
  expect(onAdd).toHaveBeenCalledWith(
    expect.objectContaining({ amount: 2.5, perUnit: expect.objectContaining({ kcal: 20 }) }),
  )
})

it('prices the figures against the amount the column stores', async () => {
  await openOwnPanel()
  await fill('NAME', 'Saffron')
  await fill('PORTION', '0.006')
  await fill('CALORIES', '50')
  await user.press(add())
  // 0.006 is stored as 0.01, so 50 kcal over it is 5000 per gram, not 8333.
  expect(onAdd).toHaveBeenCalledWith(
    expect.objectContaining({ amount: 0.01, perUnit: expect.objectContaining({ kcal: 5000 }) }),
  )
})

it('will not add an amount or a figure the database would refuse', async () => {
  await openOwnPanel()
  await fill('NAME', 'Salt')
  await fill('CALORIES', '0')

  await fill('PORTION', '0.004')
  await user.press(add())
  await fill('PORTION', '150000')
  await user.press(add())

  // Fits as an amount, but 20,000 kcal over 0.01 g overflows the per-unit column.
  await fill('PORTION', '0.01')
  await fill('CALORIES', '20000')
  await user.press(add())

  expect(onAdd).not.toHaveBeenCalled()
})
