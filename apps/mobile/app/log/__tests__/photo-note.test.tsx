import '@/i18n'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { render as renderBare, screen, userEvent } from '@/test-utils'
import LogRoute from '../index'

/**
 * The shutter no longer scans on its own when the note step is on: it hands the
 * shot to the note panel, and the scan starts from Skip or Log. What is pinned
 * is which shots get asked and what reaches `useSnapFood`.
 */

const mockParams: { panel?: string; code?: string } = { panel: 'camera' }
const mockSnap = jest.fn()
const mockBack = jest.fn()
let mockSettings: Record<string, unknown> = {}

jest.mock('expo-router', () => ({
  useRouter: () => ({}),
  useLocalSearchParams: () => mockParams,
}))
jest.mock('@/lib/navigation', () => ({ useBack: () => mockBack }))
jest.mock('@/lib/analytics', () => ({ track: jest.fn(), dateOffset: () => 0 }))
jest.mock('@/data', () => ({
  useSession: () => ({ session: {}, loading: false }),
  useUserId: () => 'note-taker',
  useLogFood: () => jest.fn(),
  useSnapFood: () => mockSnap,
  useDescribeFood: () => jest.fn(),
  useSelectedDate: () => ({ selectedDate: '2026-10-03', todayKey: '2026-10-03' }),
  useDayLog: () => ({ entries: [] }),
  useTargets: () => ({ data: { kcal: 2000 } }),
  useActivityDay: () => ({ data: null }),
  useSettings: () => ({ data: mockSettings }),
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
    InlineCamera: ({ onCapture }: { onCapture: (uri: string | undefined) => void }) => (
      <Pressable accessibilityRole="button" onPress={() => onCapture('file:///plate.jpg')}>
        <Text>Shutter</Text>
      </Pressable>
    ),
    CaptureSwitch: () => null,
    DescribePanel: () => null,
    FoodSearchPanel: () => null,
    PhotoNotePanel: jest.requireActual('@/features/logging/PhotoNotePanel').PhotoNotePanel,
  }
})
jest.mock('@/ui', () => {
  const { View } = require('react-native')
  return {
    ...jest.requireActual('@/ui'),
    SheetSurface: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    useToast: () => jest.fn(),
  }
})

const user = userEvent.setup()

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}
const render = (ui: React.ReactElement) =>
  renderBare(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>)

beforeEach(() => {
  mockSnap.mockClear()
  mockBack.mockClear()
  mockSettings = {}
  mockParams.panel = 'camera'
  mockParams.code = undefined
})

it('asks for a note after the shutter and sends it with the photo', async () => {
  await render(<LogRoute />)
  await user.press(screen.getByRole('button', { name: 'Shutter' }))

  // Nothing is sent until the note is.
  expect(mockSnap).not.toHaveBeenCalled()
  // And the tiles are put away, since every one of them would drop the shot.
  expect(screen.queryByRole('button', { name: 'Search' })).toBeNull()

  await user.type(screen.getByPlaceholderText('Beef not chicken, teh o kosong, shared'), 'beef')
  await user.press(screen.getByRole('button', { name: 'Log meal' }))

  expect(mockSnap).toHaveBeenCalledWith({
    photoUri: 'file:///plate.jpg',
    logDate: '2026-10-03',
    note: 'beef',
  })
  expect(mockBack).toHaveBeenCalled()
})

it('sends the photo alone on Skip', async () => {
  await render(<LogRoute />)
  await user.press(screen.getByRole('button', { name: 'Shutter' }))
  await user.press(screen.getByRole('button', { name: 'Skip' }))

  expect(mockSnap).toHaveBeenCalledWith({
    photoUri: 'file:///plate.jpg',
    logDate: '2026-10-03',
    note: undefined,
  })
})

it('drops the shot and reopens the camera on Retake', async () => {
  await render(<LogRoute />)
  await user.press(screen.getByRole('button', { name: 'Shutter' }))
  await user.press(screen.getByRole('button', { name: 'Retake' }))

  expect(screen.getByRole('button', { name: 'Shutter' })).toBeOnTheScreen()
  expect(mockSnap).not.toHaveBeenCalled()
})

it('scans at the shutter when the setting is off', async () => {
  mockSettings = { photo_note_prompt: false }
  await render(<LogRoute />)
  await user.press(screen.getByRole('button', { name: 'Shutter' }))

  expect(mockSnap).toHaveBeenCalledWith({
    photoUri: 'file:///plate.jpg',
    logDate: '2026-10-03',
    barcode: undefined,
  })
  expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()
})

it('does not ask about a nutrition panel shot for an unknown packet', async () => {
  mockParams.panel = 'label'
  mockParams.code = '9556001234567'
  await render(<LogRoute />)
  await user.press(screen.getByRole('button', { name: 'Shutter' }))

  expect(mockSnap).toHaveBeenCalledWith({
    photoUri: 'file:///plate.jpg',
    logDate: '2026-10-03',
    barcode: '9556001234567',
  })
})
