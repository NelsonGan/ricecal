import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import type { ReactNode } from 'react'
import { render, screen, userEvent } from '@/test-utils'
import { type EditableRecipeIngredient, RecipeIngredientEditor } from '../RecipeIngredientEditor'

jest.mock('@/features/shared/SwipeRow', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native')
  return {
    SwipeRow: ({
      actions,
      children,
    }: {
      actions: Array<{ label: string; a11yLabel?: string; onPress: () => void }>
      children: ReactNode
    }) => (
      <View>
        {children}
        {actions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.a11yLabel ?? action.label}
            onPress={action.onPress}
          >
            <Text>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
  }
})

const RICE: EditableRecipeIngredient = {
  key: 'rice',
  name: 'Rice',
  foodId: 'food-1',
  amount: 200,
  unit: 'g',
  perUnit: { kcal: 1.3, carbs: 0.28, protein: 0.027, fat: 0.003 },
}

const user = userEvent.setup()

it('leaves an empty list with only its add action', async () => {
  const onAdd = jest.fn()

  await render(
    <RecipeIngredientEditor
      ingredients={[]}
      onAmountChange={jest.fn()}
      onAdd={onAdd}
      onRemove={jest.fn()}
      onReplace={jest.fn()}
    />,
  )

  expect(screen.queryByText(/Nothing yet/)).toBeNull()
  await user.press(screen.getByRole('button', { name: 'Add an ingredient' }))
  expect(onAdd).toHaveBeenCalledTimes(1)
})

it('edits the amount in place and exposes replace and delete swipe actions', async () => {
  const onAmountChange = jest.fn()

  await render(
    <RecipeIngredientEditor
      ingredients={[RICE]}
      onAmountChange={onAmountChange}
      onAdd={jest.fn()}
      onRemove={jest.fn()}
      onReplace={jest.fn()}
    />,
  )

  expect(screen.getByText('260 kcal')).toBeOnTheScreen()
  expect(screen.getByLabelText('Change how much Rice, currently 200 g')).toBeOnTheScreen()
  expect(screen.getByLabelText('Replace Rice')).toBeOnTheScreen()
  expect(screen.getByLabelText('Remove, Rice')).toBeOnTheScreen()

  await user.press(screen.getByRole('button', { name: 'More Rice' }))
  expect(onAmountChange).toHaveBeenCalledWith('rice', 210)
})

// Two tablespoons of soy sauce are stored as 29.57 ml and read as spoons: the
// number, the nudge and the typed amount are all in tablespoons.
const KICAP: EditableRecipeIngredient = {
  key: 'kicap',
  name: 'Kicap',
  amount: 29.57,
  unit: 'ml',
  displayUnit: 'tbsp',
  perUnit: { kcal: 0.6, carbs: 0.1, protein: 0.05, fat: 0 },
}

it('shows and steps a spoon row in spoons, and stores millilitres', async () => {
  const onAmountChange = jest.fn()
  const onUnitChange = jest.fn()

  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 852 },
        insets: { top: 59, left: 0, right: 0, bottom: 34 },
      }}
    >
      <RecipeIngredientEditor
        ingredients={[KICAP]}
        onAmountChange={onAmountChange}
        onUnitChange={onUnitChange}
        units="metric"
        onAdd={jest.fn()}
        onRemove={jest.fn()}
        onReplace={jest.fn()}
      />
    </SafeAreaProvider>,
  )

  expect(screen.getByLabelText('Change how much Kicap, currently 2 tbsp')).toBeOnTheScreen()

  // Half a spoon more is 2.5 tbsp, which is 36.97 ml.
  await user.press(screen.getByRole('button', { name: 'More Kicap' }))
  expect(onAmountChange).toHaveBeenCalledWith('kicap', 36.97)

  // Teaspoons are the same family, so the row can be read in them without
  // being repriced. Back to ml clears the display unit entirely.
  await user.press(screen.getByRole('button', { name: 'Unit for Kicap, tbsp' }))
  // Each choice says what the row will read as: two tablespoons are six teaspoons.
  await user.press(screen.getByText('6 tsp'))
  expect(onUnitChange).toHaveBeenCalledWith('kicap', 'tsp')
  // 29.57 ml already reads as 6 tsp, so the amount is left alone: the one call
  // is the half-spoon above.
  expect(onAmountChange).toHaveBeenCalledTimes(1)
})

// A line that rounds ("6½ tbsp" for 97 ml) is what the row reads afterwards.
it('lands the row on the amount the unit line promised', async () => {
  const onAmountChange = jest.fn()
  const onUnitChange = jest.fn()
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 852 },
        insets: { top: 59, left: 0, right: 0, bottom: 34 },
      }}
    >
      <RecipeIngredientEditor
        ingredients={[{ ...KICAP, amount: 97, displayUnit: 'cup' }]}
        onAmountChange={onAmountChange}
        onUnitChange={onUnitChange}
        units="metric"
        onAdd={jest.fn()}
        onRemove={jest.fn()}
        onReplace={jest.fn()}
      />
    </SafeAreaProvider>,
  )
  await user.press(screen.getByRole('button', { name: 'Unit for Kicap, cup' }))
  await user.press(screen.getByText('6½ tbsp'))
  expect(onUnitChange).toHaveBeenCalledWith('kicap', 'tbsp')
  expect(onAmountChange).toHaveBeenCalledWith('kicap', 96.11)
})

// 10.5 g printed as "11" disagreed with the 10.5 stored. Re-picking grams
// changes nothing, and kilograms (0.01 kg, 5% less sugar) are not offered.
it('shows small gram amounts exactly and does not offer a unit that would round them', async () => {
  const onAmountChange = jest.fn()
  const onUnitChange = jest.fn()
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 852 },
        insets: { top: 59, left: 0, right: 0, bottom: 34 },
      }}
    >
      <RecipeIngredientEditor
        ingredients={[
          {
            key: 'sugar',
            name: 'Sugar',
            amount: 10.5,
            unit: 'g',
            perUnit: { kcal: 3.87, carbs: 1, protein: 0, fat: 0 },
          },
        ]}
        onAmountChange={onAmountChange}
        onUnitChange={onUnitChange}
        units="metric"
        onAdd={jest.fn()}
        onRemove={jest.fn()}
        onReplace={jest.fn()}
      />
    </SafeAreaProvider>,
  )
  expect(screen.getByLabelText('Change how much Sugar, currently 10.5 g')).toBeOnTheScreen()
  // Kilograms would round it to 0.01 kg, so it is not offered, and with
  // nothing else to pick the unit is a word rather than a pill that opens a
  // list of itself.
  expect(screen.queryByRole('button', { name: 'Unit for Sugar, g' })).toBeNull()
  expect(screen.getByText('g')).toBeOnTheScreen()
  expect(onAmountChange).not.toHaveBeenCalled()
  expect(onUnitChange).not.toHaveBeenCalled()
})

it('keeps the unit pill where another unit still fits', async () => {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 852 },
        insets: { top: 59, left: 0, right: 0, bottom: 34 },
      }}
    >
      <RecipeIngredientEditor
        ingredients={[
          {
            key: 'chicken',
            name: 'Chicken thighs',
            amount: 1000,
            unit: 'g',
            perUnit: { kcal: 1.7, carbs: 0, protein: 0.2, fat: 0.1 },
          },
        ]}
        onAmountChange={jest.fn()}
        onUnitChange={jest.fn()}
        units="metric"
        onAdd={jest.fn()}
        onRemove={jest.fn()}
        onReplace={jest.fn()}
      />
    </SafeAreaProvider>,
  )
  await user.press(screen.getByRole('button', { name: 'Unit for Chicken thighs, g' }))
  expect(screen.getByRole('radio', { name: '1 kg, 1,700 kcal' })).toBeOnTheScreen()
})
