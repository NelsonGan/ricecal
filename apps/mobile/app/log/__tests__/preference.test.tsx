import '@/i18n'
import { createMMKV } from 'react-native-mmkv'

import { render, screen, userEvent } from '@/test-utils'
import LogRoute from '../index'

const storage = createMMKV({ id: 'ricecal-logging' })
const mockParams: { panel?: string; code?: string } = {}
let mockUserId = 'logger-1'
const mockTrack = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({}),
  useLocalSearchParams: () => mockParams,
}))
jest.mock('@/lib/navigation', () => ({ useBack: () => jest.fn() }))
jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
  dateOffset: () => 0,
}))
jest.mock('@/data', () => ({
  useSession: () => ({ session: {}, loading: false }),
  useUserId: () => mockUserId,
  useLogFood: () => jest.fn(),
  useSnapFood: () => jest.fn(),
  useDescribeFood: () => jest.fn(),
  useSelectedDate: () => ({ selectedDate: '2026-10-03', todayKey: '2026-10-03' }),
  useDayLog: () => ({ entries: [] }),
  useTargets: () => ({ data: { kcal: 2000 } }),
  useActivityDay: () => ({ data: null }),
  useSettings: () => ({ data: {} }),
  useRecipeQuota: () => ({ atLimit: false }),
  useScanQuota: () => ({ data: { entitled: true } }),
  today: () => '2026-10-03',
}))
jest.mock('@/features/paywall', () => ({ useRequirePro: () => () => true }))
jest.mock('@/features/logging', () => {
  const { Pressable, Text } = require('react-native')
  return {
    QuickAction: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
    InlineCamera: () => <Text>Camera panel</Text>,
    DescribePanel: () => <Text>Describe panel</Text>,
    FoodSearchPanel: ({ initialSource }: { initialSource?: string }) => (
      <Text>{initialSource === 'mine' ? 'My foods panel' : 'Search panel'}</Text>
    ),
  }
})
jest.mock('@/ui', () => {
  const { Text, View } = require('react-native')
  return {
    Text,
    SheetSurface: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Tabs: ({ value }: { value: string }) => <Text>{`Capture mode: ${value}`}</Text>,
    useToast: () => jest.fn(),
  }
})

beforeEach(() => {
  storage.clearAll()
  mockParams.panel = undefined
  mockUserId = 'logger-1'
  mockTrack.mockClear()
})

const user = userEvent.setup()

it('remembers Search after closing the panel and reopening the modal', async () => {
  const first = await render(<LogRoute />)
  expect(screen.getByText('Camera panel')).toBeOnTheScreen()
  await user.press(screen.getByRole('button', { name: 'Search' }))
  expect(screen.getByText('Search panel')).toBeOnTheScreen()
  await user.press(screen.getByRole('button', { name: 'Search' }))
  expect(screen.queryByText('Search panel')).toBeNull()
  expect(mockTrack).toHaveBeenCalledTimes(1)
  await first.unmount()

  await render(<LogRoute />)
  expect(screen.getByText('Search panel')).toBeOnTheScreen()
  expect(mockTrack).toHaveBeenLastCalledWith('Log Sheet Opened', {
    panel: 'search',
    date_offset: 0,
  })
})

it.each([
  ['Describe', 'Describe panel'],
  ['Snap', 'Camera panel'],
])('remembers %s when switching away from Search', async (label, content) => {
  storage.set('panel:logger-1', 'search')
  const first = await render(<LogRoute />)
  await user.press(screen.getByRole('button', { name: label }))
  await first.unmount()
  await render(<LogRoute />)
  expect(screen.getByText(content)).toBeOnTheScreen()
})

it('keeps each account’s choice separate on the same phone', async () => {
  const first = await render(<LogRoute />)
  await user.press(screen.getByRole('button', { name: 'Search' }))
  await first.unmount()
  mockUserId = 'logger-2'
  const second = await render(<LogRoute />)
  expect(screen.getByText('Camera panel')).toBeOnTheScreen()
  await second.unmount()
  mockUserId = 'logger-1'
  await render(<LogRoute />)
  expect(screen.getByText('Search panel')).toBeOnTheScreen()
})

it.each([
  ['camera', 'Camera panel', 'camera'],
  ['barcode', 'Camera panel', 'camera'],
  ['label', 'Camera panel', 'camera'],
  ['recipes', 'My foods panel', 'search'],
  ['search', 'Search panel', 'search'],
  ['describe', 'Describe panel', 'describe'],
])(
  'honours an explicit %s link and remembers its opened option',
  async (opening, content, panel) => {
    storage.set('panel:logger-1', panel === 'camera' ? 'search' : 'camera')
    mockParams.panel = opening
    const linked = await render(<LogRoute />)
    expect(screen.getByText(content)).toBeOnTheScreen()
    if (opening === 'barcode') expect(screen.getByText('Capture mode: barcode')).toBeOnTheScreen()
    expect(mockTrack).toHaveBeenLastCalledWith('Log Sheet Opened', { panel, date_offset: 0 })
    await linked.unmount()
    mockParams.panel = undefined
    await render(<LogRoute />)
    expect(screen.getByText(panel === 'search' ? 'Search panel' : content)).toBeOnTheScreen()
  },
)

it('ignores an unrecognized stored preference', async () => {
  storage.set('panel:logger-1', 'old-option')
  await render(<LogRoute />)
  expect(screen.getByText('Camera panel')).toBeOnTheScreen()
})
