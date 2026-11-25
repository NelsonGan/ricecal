import { SafeAreaProvider } from 'react-native-safe-area-context'
import '@/i18n'
import type { ChatFood, GroupFoodView } from '@/data/groups'
import { fireEvent, render, screen } from '@/test-utils'
import { Tappable, Text, ToastProvider } from '@/ui'
import { GroupFoodScreen } from '../FoodView'
import { useOpenGroupFood } from '../parts'

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

const mockPush = jest.fn()
const mockBack = jest.fn()
const mockPress = jest.fn()
const mockRefetch = jest.fn()
let mockFoodView: GroupFoodView | undefined
let mockIsError = false
let mockUnits: 'metric' | 'imperial' = 'metric'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, canGoBack: () => true, back: mockBack }),
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
}))
jest.mock('@/data/groups', () => ({
  ...jest.requireActual('@/data/groups'),
  useGroupFood: () => ({
    data: mockFoodView,
    isError: mockIsError,
    fetchStatus: 'idle',
    refetch: mockRefetch,
  }),
  useGroupAction: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
}))
const mockShowMacros = false
const mockUpdateSettings = jest.fn()

jest.mock('@/data', () => ({
  ENTRY_FOOD_ID: '__entry__',
  dateKey: () => '2026-10-21',
  useUserId: () => 'me',
  useSettings: () => ({ data: { units: mockUnits, show_part_macros: mockShowMacros } }),
  useUpdateSettings: () => ({ mutate: mockUpdateSettings }),
  useMealPhotoUrl: () => ({ data: undefined }),
  storedImageSource: () => undefined,
}))
jest.mock('../parts', () => {
  const actual = jest.requireActual('../parts')
  return {
    ...actual,
    useGroupTask: () => ({ press: mockPress, run: jest.fn(), isPending: false }),
    EntryPicture: () => null,
    PersonAvatar: () => null,
  }
})

const sampleFood = (patch: Partial<GroupFoodView> = {}): GroupFoodView => ({
  owner: { id: 'aisha', name: 'Aisha Rahman', handle: 'aisha', avatar_path: null },
  food: {
    id: 'entry-1',
    post_id: 'post-1',
    name: 'Nasi lemak with sambal',
    brand: 'Village Park',
    icon_set: 'dishes',
    icon_name: 'nasi-lemak',
    photo_path: 'meals/aisha/nasi.jpg',
    log_date: '2026-10-21',
    logged_at: '2026-10-21T04:30:00Z',
    serving_label: '1 plate',
    quantity: 1,
    plate_quantity: 1,
    eaten: 1,
    grams: 420,
    kcal: 642,
    carbs_g: 74.2,
    protein_g: 26.8,
    fat_g: 25.4,
    fibre_g: 4.2,
    sugar_g: 7.5,
    sodium_mg: 980,
    likes: 3,
    dislikes: 0,
    mine: 0,
  },
  ingredients: [
    {
      id: 'ing-1',
      name: 'Coconut rice',
      quantity: 1,
      serving_label: 'cup',
      kcal: 280,
      carbs_g: 48,
      protein_g: 4.5,
      fat_g: 8,
      grams: 180,
      display_unit: 'g',
      position: 0,
    },
    {
      id: 'ing-2',
      name: 'Fried anchovies & peanuts',
      quantity: 1,
      serving_label: 'handful',
      kcal: 192,
      carbs_g: 8.2,
      protein_g: 12.3,
      fat_g: 12.4,
      grams: 45,
      display_unit: 'g',
      position: 1,
    },
    {
      id: 'ing-3',
      name: 'Sambal & egg',
      quantity: 1,
      serving_label: 'portion',
      kcal: 170,
      carbs_g: 18,
      protein_g: 10,
      fat_g: 5,
      grams: 95,
      display_unit: 'g',
      position: 2,
    },
  ],
  ...patch,
})

const wrap = (node: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <ToastProvider>{node}</ToastProvider>
  </SafeAreaProvider>
)

beforeEach(() => {
  jest.clearAllMocks()
  mockIsError = false
  mockUnits = 'metric'
  mockFoodView = sampleFood()
})

describe('GroupFoodScreen', () => {
  it('shows full stats: serving and weight, macros, expandable extra nutrients and ingredients', async () => {
    await render(wrap(<GroupFoodScreen groupId="g1" postId="post-1" />))

    expect(screen.getByText('Nasi lemak with sambal')).toBeOnTheScreen()
    expect(screen.getByText('Aisha Rahman')).toBeOnTheScreen()
    expect(screen.getByText(/Village Park/)).toBeOnTheScreen()
    expect(screen.getByText('1 plate (420 g)')).toBeOnTheScreen()
    expect(screen.getAllByText('642')).toHaveLength(2)
    expect(screen.getByText('74.2g')).toBeOnTheScreen()
    expect(screen.getByText('26.8g')).toBeOnTheScreen()
    expect(screen.getByText('25.4g')).toBeOnTheScreen()

    // Extra nutrients are collapsed until tapped.
    expect(screen.queryByText('980mg')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'More nutrients' }))
    expect(screen.getByText('4.2g')).toBeOnTheScreen()
    expect(screen.getByText('7.5g')).toBeOnTheScreen()
    expect(screen.getByText('980mg')).toBeOnTheScreen()

    // Ingredients list and plate total.
    expect(screen.getByText(/Coconut Rice/)).toBeOnTheScreen()
    expect(screen.getByText(/Fried Anchovies & Peanuts/)).toBeOnTheScreen()
    expect(screen.getByText('Total')).toBeOnTheScreen()
    expect(screen.getByText('280')).toBeOnTheScreen()
  })

  it('opens the owner profile when tapping the author pill', async () => {
    await render(wrap(<GroupFoodScreen groupId="g1" postId="post-1" />))
    await fireEvent.press(screen.getByRole('button', { name: "Open Aisha Rahman's profile" }))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/social/profile/[id]',
      params: { id: 'aisha' },
    })
  })

  it('shows the scaled total row when more than one plate was logged', async () => {
    const base = sampleFood()
    mockFoodView = {
      ...base,
      food: { ...base.food, plate_quantity: 2, eaten: 2, kcal: 1284 },
    }
    await render(wrap(<GroupFoodScreen groupId="g1" postId="post-1" />))
    expect(screen.getByText('× 2')).toBeOnTheScreen()
    expect(screen.getAllByText('1,284').length).toBeGreaterThanOrEqual(2)
  })

  it('hides More nutrients and Ingredients when neither was recorded', async () => {
    const base = sampleFood()
    mockFoodView = {
      ...base,
      food: {
        ...base.food,
        photo_path: null,
        brand: null,
        grams: null,
        fibre_g: null,
        sugar_g: null,
        sodium_mg: null,
      },
      ingredients: [],
    }
    await render(wrap(<GroupFoodScreen groupId="g1" postId="post-1" />))
    expect(screen.getByText('1 plate')).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'More nutrients' })).toBeNull()
    expect(screen.queryByText('Total')).toBeNull()
  })

  it('omits the redundant weight bracket when the serving is already in weight or ml', async () => {
    const base = sampleFood()
    mockFoodView = {
      ...base,
      food: { ...base.food, serving_label: 'Regular (350 ml)', grams: 350 },
      ingredients: [],
    }
    await render(wrap(<GroupFoodScreen groupId="g1" postId="post-1" />))
    expect(screen.getByText('350 ml')).toBeOnTheScreen()
    expect(screen.queryByText(/350 ml \(/)).toBeNull()
  })

  it('shows a retry notice when the food is unavailable', async () => {
    mockFoodView = undefined
    mockIsError = true
    await render(wrap(<GroupFoodScreen groupId="g1" postId="post-1" />))
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })
})

describe('useOpenGroupFood', () => {
  function Harness({ food, ownerId }: { food: ChatFood; ownerId: string }) {
    const open = useOpenGroupFood('g1')
    return (
      <Tappable onPress={() => open(food, ownerId)} accessibilityRole="button">
        <Text>Open food</Text>
      </Tappable>
    )
  }

  const baseChatFood: ChatFood = {
    post_id: 'post-1',
    entry_id: 'entry-1',
    log_date: '2026-10-21',
    food_id: 'food-1',
    name: 'Nasi lemak',
    icon_set: null,
    icon_name: null,
    photo_path: null,
    serving_label: '1 plate',
    quantity: 1,
    logged_at: '2026-10-21T04:30:00Z',
    kcal: 642,
    carbs_g: 74,
    protein_g: 27,
    fat_g: 25,
  }

  it('opens the read-only group food page for a friend', async () => {
    await render(wrap(<Harness food={baseChatFood} ownerId="aisha" />))
    await fireEvent.press(screen.getByRole('button', { name: 'Open food' }))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/group/food',
      params: { group: 'g1', post: 'post-1' },
    })
  })

  it('opens the diary detail page for the viewer when entry id and day are present', async () => {
    await render(wrap(<Harness food={baseChatFood} ownerId="me" />))
    await fireEvent.press(screen.getByRole('button', { name: 'Open food' }))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/log/food/[id]',
      params: { id: 'food-1', entryId: 'entry-1', date: '2026-10-21' },
    })
  })

  it('falls back to the group food page for the viewer when older payloads omit log_date', async () => {
    await render(wrap(<Harness food={{ ...baseChatFood, log_date: undefined }} ownerId="me" />))
    await fireEvent.press(screen.getByRole('button', { name: 'Open food' }))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/group/food',
      params: { group: 'g1', post: 'post-1' },
    })
  })
})
