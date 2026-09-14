import '@/i18n'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import type { ScannedRecipe } from '@/data'
import RecipeFormScreen from '../edit'

const mockRead = jest.fn()
const mockUpload = jest.fn()
const mockBack = jest.fn()
const mockReplace = jest.fn()

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ replace: mockReplace }),
}))

jest.mock('@/data', () => ({
  isRecipeLimit: () => false,
  removeMealPhoto: jest.fn(() => Promise.resolve()),
  storedImageSource: () => undefined,
  uploadMealPhoto: (uri: string) => mockUpload(uri),
  useFood: () => ({ data: undefined }),
  useFoodSearch: () => ({ data: [], isFetching: false }),
  useMealPhotoUrl: () => ({ data: undefined, isLoading: false }),
  useReadRecipe: () => ({ mutateAsync: mockRead }),
  useRecipe: () => ({ data: undefined }),
  useRecipeIngredients: () => ({ data: undefined }),
  useSaveRecipe: () => ({ mutateAsync: jest.fn(), isPending: false }),
}))

jest.mock('@/data/refusals', () => ({
  announceRefusal: () => false,
  openPaywall: jest.fn(),
}))

jest.mock('@/features/logging', () => {
  const { Pressable, Text } = jest.requireActual('react-native') as typeof import('react-native')
  return {
    IconPicker: () => null,
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

jest.mock('@/features/paywall', () => ({
  useRequirePro: () => jest.fn(() => true),
}))

jest.mock('@/features/recipes', () => {
  const React = jest.requireActual('react') as typeof import('react')
  const { Pressable, Text, TextInput, View } = jest.requireActual(
    'react-native',
  ) as typeof import('react-native')

  return {
    DescribeRecipePanel: ({ onSubmit }: { onSubmit: (text: string) => void }) => {
      const [text, setText] = React.useState('')
      return (
        <View>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Kari ayam. 600g chicken thigh, feeds 4."
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fill in the form"
            onPress={() => onSubmit(text)}
          >
            <Text>Fill in the form</Text>
          </Pressable>
        </View>
      )
    },
    IngredientSheet: () => null,
    NewRecipeChooser: ({
      onManual,
      onPhoto,
      onDescribe,
    }: {
      onManual: () => void
      onPhoto: () => void
      onDescribe: () => void
    }) => (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fill it in myself"
          onPress={onManual}
        >
          <Text>Fill it in myself</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Photo" onPress={onPhoto}>
          <Text>Photo</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Describe" onPress={onDescribe}>
          <Text>Describe</Text>
        </Pressable>
      </View>
    ),
    potTotals: () => ({
      total: { kcal: 0, carbs: 0, protein: 0, fat: 0 },
      perServing: { kcal: 0, carbs: 0, protein: 0, fat: 0 },
    }),
    ReadingRecipe: ({ source }: { source: string }) => <Text>Reading {source}</Text>,
    RecipeIngredientEditor: ({
      ingredients,
    }: {
      ingredients: Array<{ key: string; name: string }>
    }) => (
      <View>
        {ingredients.map((ingredient) => (
          <Text key={ingredient.key}>{ingredient.name}</Text>
        ))}
      </View>
    ),
    StepsField: ({ value }: { value: string }) => (
      <View>
        {value.split('\n').map((step) => (
          <Text key={step}>{step}</Text>
        ))}
      </View>
    ),
  }
})

jest.mock('@/features/shared', () => ({ MealPhoto: () => null }))

jest.mock('@/lib/navigation', () => ({
  useBack: () => mockBack,
}))

jest.mock('@/ui', () => {
  const React = jest.requireActual('react') as typeof import('react')
  const { Pressable, Text, TextInput, View } = jest.requireActual(
    'react-native',
  ) as typeof import('react-native')

  return {
    AppBar: ({
      title,
      onBack,
      backLabel,
    }: {
      title: string
      onBack: () => void
      backLabel: string
    }) => (
      <View>
        <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack}>
          <Text>{backLabel}</Text>
        </Pressable>
        <Text>{title}</Text>
      </View>
    ),
    Button: ({
      children,
      disabled,
      onPress,
    }: {
      children: import('react').ReactNode
      disabled?: boolean
      onPress: () => void
    }) => (
      <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
    Card: ({ children }: { children: import('react').ReactNode }) => <View>{children}</View>,
    cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
    ConfirmSheet: () => null,
    Icon: () => null,
    Screen: ({
      header,
      children,
      footer,
    }: {
      header?: import('react').ReactNode
      children?: import('react').ReactNode
      footer?: import('react').ReactNode
    }) => (
      <View>
        {header}
        {children}
        {footer}
      </View>
    ),
    Sheet: ({
      visible,
      onShow,
      children,
    }: {
      visible: boolean
      onShow?: () => void
      children?: import('react').ReactNode
    }) => {
      const onShowRef = React.useRef(onShow)
      onShowRef.current = onShow
      React.useLayoutEffect(() => {
        if (visible) onShowRef.current?.()
      }, [visible])
      return visible ? <View>{children}</View> : null
    },
    Skeleton: () => null,
    Stepper: ({ value }: { value: number }) => <Text>{value}</Text>,
    Tappable: ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children: import('react').ReactNode
      onPress: () => void
      accessibilityLabel?: string
    }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
      >
        {children}
      </Pressable>
    ),
    Text: ({ children }: { children: import('react').ReactNode }) => <Text>{children}</Text>,
    TextField: ({
      label,
      value,
      onChangeText,
      placeholder,
    }: {
      label?: string
      value?: string
      onChangeText?: (text: string) => void
      placeholder?: string
    }) => (
      <View>
        {label ? <Text>{label}</Text> : null}
        <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} />
      </View>
    ),
    useToast: () => ({ show: jest.fn(), dismiss: jest.fn() }),
  }
})

const DRAFT: ScannedRecipe = {
  name: 'Chicken curry',
  servings: 4,
  steps: 'Fry the paste.\nSimmer until the chicken is tender.',
  icon: { set: 'food', name: 'cooking-pot' },
  ingredients: [
    {
      name: 'Chicken thigh',
      amount: 600,
      unit: 'g',
      perUnit: { kcal: 2.09, carbs: 0, protein: 0.26, fat: 0.11 },
    },
  ],
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRead.mockResolvedValue(DRAFT)
  mockUpload.mockResolvedValue('meals/user-1/recipe.jpg')
})

async function describe(text: string) {
  await fireEvent.press(screen.getByRole('button', { name: 'Describe' }))
  const field = await screen.findByPlaceholderText(/Kari ayam/)
  await fireEvent.changeText(field, text)
  await fireEvent.press(screen.getByRole('button', { name: 'Fill in the form' }))
}

it('fills the new-food form from an AI description', async () => {
  await render(<RecipeFormScreen />)

  await describe('Chicken curry, feeds four')

  expect(mockRead).toHaveBeenCalledWith({ text: 'Chicken curry, feeds four' })
  expect(await screen.findByDisplayValue('Chicken curry')).toBeOnTheScreen()
  expect(screen.getByText('Chicken thigh')).toBeOnTheScreen()
  expect(screen.getByText('Fry the paste.')).toBeOnTheScreen()
  expect(screen.getByText('Simmer until the chicken is tender.')).toBeOnTheScreen()
})

it('uploads and fills the new-food form from an AI photo read', async () => {
  await render(<RecipeFormScreen />)

  await fireEvent.press(screen.getByRole('button', { name: 'Photo' }))
  await fireEvent.press(screen.getByRole('button', { name: 'Capture photo' }))

  await waitFor(() => {
    expect(mockUpload).toHaveBeenCalledWith('file:///recipe.jpg')
    expect(mockRead).toHaveBeenCalledWith({ photoPath: 'meals/user-1/recipe.jpg' })
  })
  expect(await screen.findByDisplayValue('Chicken curry')).toBeOnTheScreen()
  expect(screen.getByText('Chicken thigh')).toBeOnTheScreen()
})

it('keeps manual answers when AI is used after returning to the chooser', async () => {
  await render(<RecipeFormScreen />)

  await fireEvent.press(screen.getByRole('button', { name: 'Fill it in myself' }))
  await fireEvent.changeText(screen.getByPlaceholderText('What do you call it?'), 'My curry')
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }))

  await describe('Chicken curry, feeds four')

  await waitFor(() => expect(screen.getByDisplayValue('My curry')).toBeOnTheScreen())
  expect(screen.getByText('Chicken thigh')).toBeOnTheScreen()
})
