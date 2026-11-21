import '@/i18n'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import type { ScannedRecipe } from '@/data'
import { clearRecipeRead, stageRecipeRead } from '@/features/recipes'
import RecipeFormScreen from '../edit'

const mockRead = jest.fn()
const mockUpload = jest.fn()
const mockRemovePhoto = jest.fn((_path: string) => Promise.resolve())
const mockBack = jest.fn()
const mockReplace = jest.fn()
const mockSave = jest.fn()

const mockParams: { current: Record<string, string> } = { current: {} }

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams.current,
  useRouter: () => ({ replace: mockReplace }),
}))

jest.mock('@/data', () => ({
  isRecipeLimit: () => false,
  RECIPE_TAGS: ['breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'drink'],
  removeMealPhoto: (path: string) => mockRemovePhoto(path),
  storedImageSource: () => undefined,
  uploadMealPhoto: (uri: string) => mockUpload(uri),
  useFood: () => ({ data: undefined }),
  useFoodSearch: () => ({ data: [], isFetching: false }),
  useMealPhotoUrl: () => ({ data: undefined, isLoading: false }),
  useReadRecipe: () => ({ mutateAsync: mockRead }),
  useRecipe: () => ({ data: undefined }),
  useRecipeIngredients: () => ({ data: undefined }),
  useSettings: () => ({ data: { units: 'metric' } }),
  useSaveRecipe: () => ({ mutateAsync: mockSave, isPending: false }),
}))

jest.mock('@/data/refusals', () => ({
  announceRefusal: () => false,
  openPaywall: jest.fn(),
}))

jest.mock('@/features/logging', () => ({
  IconPicker: () => null,
}))

jest.mock('@/features/recipes', () => {
  const { Text, View } = jest.requireActual('react-native') as typeof import('react-native')
  const pendingRead = jest.requireActual(
    '@/features/recipes/pendingRead',
  ) as typeof import('@/features/recipes/pendingRead')

  return {
    ...pendingRead,
    IngredientSheet: () => null,
    normaliseSourceUrl: jest.requireActual('@/features/recipes/cooking').normaliseSourceUrl,
    parseMinutes: jest.requireActual('@/features/recipes/cooking').parseMinutes,
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
    Chip: ({
      children,
      selected,
      onPress,
    }: {
      children: import('react').ReactNode
      selected?: boolean
      onPress?: () => void
    }) => (
      <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
    FormCard: ({ children }: { children: import('react').ReactNode }) => <View>{children}</View>,
    FormRow: ({ label, children }: { label: string; children?: import('react').ReactNode }) => (
      <View>
        <Text>{label}</Text>
        {children}
      </View>
    ),
    cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
    ConfirmSheet: ({
      visible,
      title,
      onConfirm,
      confirmLabel,
    }: {
      visible: boolean
      title: string
      onConfirm: () => void
      confirmLabel: string
    }) =>
      visible ? (
        <View>
          <Text>{title}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
            onPress={onConfirm}
          >
            <Text>{confirmLabel}</Text>
          </Pressable>
        </View>
      ) : null,
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
      error,
    }: {
      label?: string
      value?: string
      onChangeText?: (text: string) => void
      placeholder?: string
      error?: string
    }) => (
      <View>
        {label ? <Text>{label}</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          accessibilityLabel={label}
        />
        {error ? <Text>{error}</Text> : null}
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
  clearRecipeRead()
  mockParams.current = {}
  mockSave.mockResolvedValue({ id: 'new-recipe' })
  mockRead.mockResolvedValue(DRAFT)
  mockUpload.mockResolvedValue('meals/user-1/recipe.jpg')
})

it('opens straight onto the recipe form with no chooser page and closes back', async () => {
  await render(<RecipeFormScreen />)

  expect(screen.getByPlaceholderText('What do you call it?')).toBeOnTheScreen()
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }))
  expect(mockBack).toHaveBeenCalledTimes(1)
})

it('fills the new-recipe form from a staged AI description and discards straight back', async () => {
  stageRecipeRead({ kind: 'text', text: 'Chicken curry, feeds four' })
  mockParams.current = { read: '1' }
  await render(<RecipeFormScreen />)

  await waitFor(() => expect(mockRead).toHaveBeenCalledWith({ text: 'Chicken curry, feeds four' }))
  expect(await screen.findByDisplayValue('Chicken curry')).toBeOnTheScreen()
  expect(screen.getByText('Chicken thigh')).toBeOnTheScreen()
  expect(screen.getByText('Fry the paste.')).toBeOnTheScreen()
  expect(screen.getByText('Simmer until the chicken is tender.')).toBeOnTheScreen()

  await fireEvent.press(screen.getByRole('button', { name: 'Close' }))
  expect(await screen.findByText('Leave without saving?')).toBeOnTheScreen()
  await fireEvent.press(screen.getByRole('button', { name: 'Discard' }))
  expect(mockBack).toHaveBeenCalledTimes(1)
})

it('uploads and fills the new-recipe form from a staged AI photo read', async () => {
  stageRecipeRead({ kind: 'photo', uri: 'file:///recipe.jpg' })
  mockParams.current = { read: '1' }
  await render(<RecipeFormScreen />)

  await waitFor(() => {
    expect(mockUpload).toHaveBeenCalledWith('file:///recipe.jpg')
    expect(mockRead).toHaveBeenCalledWith({ photoPath: 'meals/user-1/recipe.jpg' })
  })
  expect(await screen.findByDisplayValue('Chicken curry')).toBeOnTheScreen()
  expect(screen.getByText('Chicken thigh')).toBeOnTheScreen()
})

it('saves times, meals and source from the form', async () => {
  await render(<RecipeFormScreen />)

  await fireEvent.changeText(screen.getByPlaceholderText('What do you call it?'), 'Kari ayam')
  await fireEvent.changeText(screen.getByLabelText('Prep time'), '20')
  await fireEvent.changeText(screen.getByLabelText('Cook time'), '50')
  await fireEvent.press(screen.getByRole('button', { name: 'Dinner' }))
  await fireEvent.press(screen.getByRole('button', { name: 'Lunch' }))
  await fireEvent.changeText(
    screen.getByPlaceholderText('Link to the reel or post'),
    'instagram.com/reel/abc',
  )
  await fireEvent.press(screen.getByText('Save recipe'))

  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Kari ayam',
        prepMinutes: 20,
        cookMinutes: 50,
        tags: ['lunch', 'dinner'],
        sourceUrl: 'https://instagram.com/reel/abc',
      }),
    ),
  )
})

it('sweeps the uploaded photo if the screen unmounts before the upload resolves', async () => {
  let resolveUpload: ((key: string) => void) | undefined
  mockUpload.mockReturnValue(
    new Promise<string>((resolve) => {
      resolveUpload = resolve
    }),
  )
  stageRecipeRead({ kind: 'photo', uri: 'file:///recipe.jpg' })
  mockParams.current = { read: '1' }

  const view = await render(<RecipeFormScreen />)
  expect(screen.getByText('Reading photo')).toBeOnTheScreen()

  await view.unmount()
  resolveUpload?.('meals/user-1/orphaned.jpg')

  await waitFor(() => expect(mockRemovePhoto).toHaveBeenCalledWith('meals/user-1/orphaned.jpg'))
  expect(mockRead).not.toHaveBeenCalled()
})

it('refuses a source that is not a link, and says so', async () => {
  await render(<RecipeFormScreen />)

  await fireEvent.changeText(screen.getByPlaceholderText('What do you call it?'), 'Kari ayam')
  await fireEvent.changeText(screen.getByPlaceholderText('Link to the reel or post'), 'my nan')
  await fireEvent.press(screen.getByText('Save recipe'))

  expect(await screen.findByText('That link does not look right')).toBeOnTheScreen()
  expect(mockSave).not.toHaveBeenCalled()
})
