import { renderHook } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { render, screen } from '@/test-utils'
import '@/i18n'
import type { GroupFoodView } from '@/data/groups'
import { FoodBody, GroupFoodScreen } from '../FoodView'
import { useOpenGroupFood } from '../parts'

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

const mockPush = jest.fn()
let mockUnits = 'metric'
beforeEach(() => {
  mockPush.mockClear()
  mockUnits = 'metric'
})
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/data', () => ({
  ENTRY_FOOD_ID: '_entry',
  useUserId: () => 'me',
  useSelectedDate: () => ({ todayKey: '2026-11-25' }),
  useSettings: () => ({ data: { units: mockUnits, show_part_macros: false } }),
  useUpdateSettings: () => ({ mutate: jest.fn() }),
  storedImageSource: () => undefined,
  useMealPhotoUrl: () => ({ data: undefined }),
}))
jest.mock('@/lib/navigation', () => ({ useBack: () => jest.fn() }))
jest.mock('@/data/groups', () => ({
  ...jest.requireActual('@/data/groups'),
  useGroupFood: () => ({ data: null, isError: false, fetchStatus: 'idle', refetch: jest.fn() }),
}))
jest.mock('../parts', () => ({
  ...jest.requireActual('../parts'),
  EntryPicture: () => null,
  PersonAvatar: () => null,
}))

const view: GroupFoodView = {
  owner: { id: 'mina', name: 'Mina Tan', handle: 'mina', avatar_path: null },
  entry: {
    id: 'entry',
    name: 'Nasi lemak',
    brand: null,
    photo_path: null,
    icon_set: 'dishes',
    icon_name: 'nasi-lemak',
    logged_at: '2026-11-25T04:40:00Z',
    log_date: '2026-11-25',
    serving_label: '1 plate',
    quantity: 1,
    plate_quantity: 1.5,
    grams: null,
    kcal: 630,
    carbs_g: 99,
    protein_g: 10.5,
    fat_g: 21,
    fibre_g: 3.2,
    sugar_g: null,
    sodium_mg: 900,
  },
  parts: [
    {
      id: 'rice',
      name: 'coconut rice',
      quantity: 1,
      servingLabel: '1 serving',
      kcal: 360,
      grams: 200,
      carbs: 60,
      protein: 6,
      fat: 10,
      position: 0,
      displayUnit: null,
    },
    {
      id: 'sambal',
      name: 'sambal',
      quantity: 1,
      servingLabel: '1 serving',
      kcal: 60,
      grams: 30,
      carbs: 6,
      protein: 1,
      fat: 4,
      position: 1,
      displayUnit: null,
    },
  ],
}

it("draws a friend's food with its portion, totals and every part", async () => {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <FoodBody view={view} heroHeight={300} />
    </SafeAreaProvider>,
  )
  expect(screen.getByText('Nasi lemak')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Mina Tan/ })).toBeTruthy()
  // Half as much again of the plate, on the total's title line.
  expect(screen.getByText('1½ plates')).toBeTruthy()
  expect(screen.getByText('KCAL TOTAL')).toBeTruthy()
  // The total, and again under the plate as the share of it eaten.
  expect(screen.getAllByText('630')).toHaveLength(2)
  expect(screen.getByText('99g')).toBeTruthy()
  // The parts in the units the owner sees them in, then the plate and the share eaten.
  expect(screen.getByText(/Coconut Rice/)).toHaveTextContent('Coconut Rice 200\u00A0g')
  expect(screen.getByText('420')).toBeTruthy()
  expect(screen.getByText('× 1½')).toBeTruthy()
  // Only the other nutrients somebody recorded, behind their own row.
  expect(screen.getByRole('button', { name: 'More nutrients' })).toBeTruthy()
  // Read only: nothing on it edits someone else's food.
  expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull()
})

it("opens a friend's food as a page and your own as your entry", async () => {
  const { result } = await renderHook(() => useOpenGroupFood('group'))
  result.current({ entry_id: 'entry', log_date: '2026-11-20' }, 'mina')
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: '/group/food',
    params: { group: 'group', entry: 'entry' },
  })
  result.current({ entry_id: 'mine', log_date: '2026-11-20', food_id: 'soy-milk' }, 'me')
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: '/log/food/[id]',
    params: { id: 'soy-milk', entryId: 'mine', date: '2026-11-20' },
  })
  result.current({ entry_id: 'estimate', log_date: '2026-11-20', food_id: null }, 'me')
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: '/log/food/[id]',
    params: { id: '_entry', entryId: 'estimate', date: '2026-11-20' },
  })
  // Without its day the entry screen would look on the wrong one.
  result.current({ entry_id: 'mine' }, 'me')
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: '/group/food',
    params: { group: 'group', entry: 'mine' },
  })
})

it("says what a portion weighs, in the reader's own units, unless it is a weight", async () => {
  const draw = async (entry: Partial<GroupFoodView['entry']>) =>
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <FoodBody
          view={{ ...view, parts: [], entry: { ...view.entry, ...entry } }}
          heroHeight={300}
        />
      </SafeAreaProvider>,
    )
  const metric = await draw({ grams: 420, plate_quantity: 1 })
  expect(screen.getByText(/^1 plate · ≈ 420\sg$/)).toBeTruthy()
  await metric.unmount()

  mockUnits = 'imperial'
  const imperial = await draw({ grams: 420, plate_quantity: 1 })
  expect(screen.getByText(/^1 plate · ≈ 14.+oz$/)).toBeTruthy()
  await imperial.unmount()

  // A portion that is already a weight does not say it twice.
  mockUnits = 'metric'
  await draw({ grams: 150, serving_label: '100 g', quantity: 1.5, plate_quantity: 1 })
  expect(screen.queryByText(/≈/)).toBeNull()
})

it('names the day the owner put it on, not the day its instant falls on', async () => {
  // Supper at half past midnight, logged onto the day before: their diary says
  // today, whatever the clock read.
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <FoodBody
        view={{ ...view, entry: { ...view.entry, logged_at: '2026-11-26T16:30:00Z' } }}
        heroHeight={300}
      />
    </SafeAreaProvider>,
  )
  // Its instant is a day or two later in any zone, so only the diary day says today.
  expect(screen.getByText(/Today at/)).toBeTruthy()
})

it('says a food that is gone or out of reach is gone, with nothing to retry', async () => {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <GroupFoodScreen groupId="group" entryId="gone" />
    </SafeAreaProvider>,
  )
  expect(screen.getByText('This is no longer available')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
})

it('gives the share eaten as the figure the diary holds, not the rounded parts times it', async () => {
  // The view rounds each part to the calorie but rounds the plate once from the
  // unrounded parts, so 787 × 1½ is 1,181 here while the diary holds 1,180.
  const part = (id: string, kcal: number, position: number) => ({
    ...view.parts[0],
    id,
    name: id,
    kcal,
    position,
  })
  const plate: GroupFoodView = {
    ...view,
    entry: { ...view.entry, kcal: 1180 },
    parts: [
      part('chicken', 330, 0),
      part('rice', 290, 1),
      part('sauce', 25, 2),
      part('soy', 20, 3),
      part('tea', 122, 4),
    ],
  }
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <FoodBody view={plate} heroHeight={300} />
    </SafeAreaProvider>,
  )
  expect(screen.getByText('787')).toBeTruthy()
  expect(screen.getAllByText('1,180')).toHaveLength(2)
  expect(screen.queryByText('1,181')).toBeNull()
})

it('keeps the parts times the share when the total was typed over', async () => {
  // Further off than rounding can explain, the owner set the total by hand, and
  // the line under the plate still says what the parts come to.
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <FoodBody view={{ ...view, entry: { ...view.entry, kcal: 500 } }} heroHeight={300} />
    </SafeAreaProvider>,
  )
  expect(screen.getByText('500')).toBeTruthy()
  expect(screen.getByText('630')).toBeTruthy()
})
