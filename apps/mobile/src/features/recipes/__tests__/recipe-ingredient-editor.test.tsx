import '@/i18n'
import type { ReactNode } from 'react'
import { render, screen, userEvent } from '@/test-utils'
import { type EditableRecipeIngredient, RecipeIngredientEditor } from '../RecipeIngredientEditor'

jest.mock('@/features/shared', () => {
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
