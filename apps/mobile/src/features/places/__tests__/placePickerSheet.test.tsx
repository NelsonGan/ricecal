import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { act, fireEvent, render, screen } from '@/test-utils'
import { PlacePickerSheet } from '../components/PlacePickerSheet'

const mockDescribe = jest.fn()
const mockNearby = jest.fn()
jest.mock('@/lib/places', () => ({
  ...jest.requireActual('@/lib/places'),
  describeCoordinate: (...args: unknown[]) => mockDescribe(...args),
  nearbyPlaces: (...args: unknown[]) => mockNearby(...args),
  searchPlaces: jest.fn(async () => []),
}))
jest.mock('@/data', () => ({
  keys: jest.requireActual('@/data/keys').keys,
  useLocatedEntries: () => ({ data: [] }),
}))
jest.mock('../services/useCurrentPlace', () => ({
  useCurrentPlace: () => ({
    status: 'idle',
    coordinate: null,
    request: jest.fn(),
    locate: jest.fn(),
  }),
}))

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  )
}

async function openPicker(onSelect = jest.fn()) {
  await render(
    <Wrapper>
      <PlacePickerSheet
        visible
        current={null}
        locating={false}
        onClose={jest.fn()}
        onSelect={onSelect}
        onRemove={jest.fn()}
      />
    </Wrapper>,
  )
  // The pin settles, then its spot is named and its neighbours listed.
  await act(async () => {
    jest.advanceTimersByTime(600)
  })
  return onSelect
}

beforeEach(() => {
  jest.useFakeTimers()
  mockDescribe.mockReset()
  mockNearby.mockReset()
  mockNearby.mockResolvedValue([])
})

afterEach(() => {
  jest.useRealTimers()
})

// The chip over the pin is drawn only with a native map, which jest has not,
// so these read what Use this spot saves rather than the chip.
it('saves a spot no geocoder can name as a pinned location', async () => {
  // The sea, a field, or both lookups down: neither geocoder names the spot.
  mockDescribe.mockResolvedValue(null)
  const onSelect = await openPicker()

  const button = screen.getByRole('button', { name: 'Use this spot' })
  expect(button).not.toBeDisabled()
  fireEvent.press(button)
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Pinned location' }),
    'current',
  )
})

it('keeps the name a geocoder gives the spot', async () => {
  mockDescribe.mockImplementation(async (coord: { latitude: number; longitude: number }) => ({
    id: null,
    name: 'Jalan Alor',
    address: '',
    ...coord,
    category: null,
  }))
  const onSelect = await openPicker()
  fireEvent.press(screen.getByRole('button', { name: 'Use this spot' }))
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jalan Alor' }), 'current')
})

// A null is also a lookup that failed this once (a rate limit, a timeout):
// asked again, a name that comes back replaces "Pinned location".
it('names a pinned spot when a second lookup can', async () => {
  mockDescribe
    .mockResolvedValueOnce(null)
    .mockImplementation(async (coord: { latitude: number; longitude: number }) => ({
      id: null,
      name: 'Jalan Alor',
      address: '',
      ...coord,
      category: null,
    }))
  const onSelect = await openPicker()
  await act(async () => {
    jest.advanceTimersByTime(2100)
  })
  fireEvent.press(screen.getByRole('button', { name: 'Use this spot' }))
  expect(mockDescribe).toHaveBeenCalledTimes(2)
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jalan Alor' }), 'current')
})
