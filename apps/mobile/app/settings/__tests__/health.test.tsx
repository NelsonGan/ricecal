import '@/i18n'
import { AppState, type AppStateStatus } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import type { HealthConnection } from '@/data'
import { act, render, screen, userEvent, waitFor } from '@/test-utils'
import HealthSettingsRoute from '../health'

const mockOffer = jest.fn()
const mockConnect = jest.fn()
const mockSync = jest.fn()
let mockPending = false
let mockConnection: HealthConnection | null = null

jest.mock('expo-router', () => ({ Redirect: () => null }))
jest.mock('@/lib/navigation', () => ({ useBack: () => jest.fn() }))
jest.mock('@/lib/health', () => ({
  offeredProviders: () => mockOffer(),
  canOfferDemo: (availability: { ok: boolean }, empty: boolean) => !availability.ok || empty,
}))
jest.mock('@/data', () => ({
  useSession: () => ({ session: {}, loading: false }),
  useHealthConnection: () => ({ data: mockConnection, isPending: false }),
  useSettings: () => ({ data: {} }),
  useUpdateSettings: () => ({ mutate: jest.fn() }),
  useConnectHealth: () => ({ mutate: mockConnect, isPending: mockPending }),
  useSyncHealth: () => ({ mutate: mockSync, isPending: false }),
  useDisconnectHealth: () => ({ mutateAsync: jest.fn() }),
  useClearDemoActivity: () => ({ mutate: jest.fn(), isPending: false }),
}))

const CONNECTED: HealthConnection = {
  provider: 'apple_health',
  connected: true,
  permissions: [],
  deviceName: null,
  backfilledFrom: null,
  lastSyncedAt: null,
}

const tree = () => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 393, height: 852 },
      insets: { top: 59, left: 0, right: 0, bottom: 34 },
    }}
  >
    <HealthSettingsRoute />
  </SafeAreaProvider>
)
const user = userEvent.setup()
const mockSubscribe = jest.spyOn(AppState, 'addEventListener')

beforeEach(() => {
  jest.clearAllMocks()
  mockPending = false
  mockConnection = null
  mockOffer.mockResolvedValue({ native: { availability: { ok: true } } })
  mockSubscribe.mockImplementation(() => ({ remove: jest.fn() }))
})

afterAll(() => mockSubscribe.mockRestore())

it('waits for device availability without flashing an unavailable message', async () => {
  mockOffer.mockReturnValue(new Promise(() => {}))
  await render(tree())
  expect(screen.queryByText('No health data here')).toBeNull()
  expect(screen.queryByText('Use demo data')).toBeNull()
})

it('keeps backfill progress and an empty read reachable after recording the connection', async () => {
  const view = await render(tree())
  await user.press(await screen.findByRole('button', { name: 'Continue' }))
  const [{ onProgress }, { onSuccess }] = mockConnect.mock.calls[0]

  mockConnection = CONNECTED
  mockPending = true
  await act(() => onProgress({ done: 0, total: 1 }))
  await view.rerender(tree())
  expect(screen.getByText('0 of 1')).toBeOnTheScreen()
  expect(screen.queryByText('Sync now')).toBeNull()

  mockPending = false
  await act(() => onSuccess({ granted: true, days: 0 }))
  await view.rerender(tree())
  expect(screen.getByText('Nothing came back')).toBeOnTheScreen()
  expect(screen.getByRole('button', { name: 'Continue' })).toBeOnTheScreen()
  expect(screen.getByRole('button', { name: 'Use demo data' })).toBeOnTheScreen()
})

it('shows connection settings after a nonempty first read', async () => {
  const view = await render(tree())
  await user.press(await screen.findByRole('button', { name: 'Continue' }))
  mockConnection = CONNECTED
  await act(() => mockConnect.mock.calls[0][1].onSuccess({ granted: true, days: 7 }))
  await view.rerender(tree())
  await user.press(screen.getByRole('button', { name: 'Sync now' }))
  expect(mockSync).toHaveBeenCalledWith('apple_health')
  expect(screen.queryByText('Nothing came back')).toBeNull()
})

it('rechecks the device when returning from its settings', async () => {
  let foreground: ((state: AppStateStatus) => void) | undefined
  const remove = jest.fn()
  mockSubscribe.mockImplementation((_event, callback) => {
    foreground = callback
    return { remove }
  })
  mockOffer.mockResolvedValueOnce({
    native: { availability: { ok: false, reason: 'not-installed' } },
  })
  const view = await render(tree())
  expect(await screen.findByText('No health data here')).toBeOnTheScreen()
  await act(() => foreground?.('active'))
  expect(await screen.findByRole('button', { name: 'Continue' })).toBeOnTheScreen()
  await view.unmount()
  expect(remove).toHaveBeenCalledTimes(1)
})

it('handles a failed device check with a retry', async () => {
  mockOffer.mockRejectedValueOnce(new Error('Health store unavailable'))
  await render(tree())
  await user.press(await screen.findByRole('button', { name: 'Check again' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeOnTheScreen())
})
