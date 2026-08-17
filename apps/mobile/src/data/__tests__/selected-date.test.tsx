import { act } from '@testing-library/react-native'
import { AppState, Text } from 'react-native'

import { render, screen } from '@/test-utils'
import { SelectedDateProvider, useSelectedDate } from '../selected-date'

/**
 * What happens to the diary when the phone is put down on one day and picked up
 * on another.
 *
 * A phone does not close apps, so this is the ordinary case rather than the edge
 * one, and every symptom of getting it wrong is silent: the heading says "Today"
 * over a day that is not, the week strip cannot reach the real one, and the log
 * button writes this morning's breakfast into a diary two days back.
 */

const mockToday = jest.fn()
jest.mock('../client', () => ({ today: () => mockToday() }))

/** Captured from the provider's own subscription, so the test can fire it. */
let listener: ((state: string) => void) | undefined

beforeEach(() => {
  listener = undefined
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string,
    handler: (state: string) => void,
  ) => {
    listener = handler
    return { remove: jest.fn() }
  }) as unknown as typeof AppState.addEventListener)
})

afterEach(() => {
  jest.restoreAllMocks()
})

function Probe() {
  const { selectedDate, todayKey } = useSelectedDate()
  return <Text>{`${todayKey}|${selectedDate}`}</Text>
}

/** Reaches the setter, for the case where the user picked a day themselves. */
let pick: ((date: string) => void) | undefined
function Picker() {
  const { setSelectedDate } = useSelectedDate()
  pick = setSelectedDate
  return null
}

function mount() {
  return render(
    <SelectedDateProvider>
      <Probe />
      <Picker />
    </SelectedDateProvider>,
  )
}

const send = async (state: string) => {
  await act(async () => {
    listener?.(state)
  })
}

it('carries the selection forward when the app returns on a later day', async () => {
  mockToday.mockReturnValue('2026-08-15')
  await mount()
  expect(screen.getByText('2026-08-15|2026-08-15')).toBeTruthy()

  mockToday.mockReturnValue('2026-08-17')
  await send('active')

  // Both, and the second is the one that mattered: `selectedDate` is what an
  // entry is written against.
  expect(screen.getByText('2026-08-17|2026-08-17')).toBeTruthy()
})

it('leaves a day the user picked where they put it', async () => {
  mockToday.mockReturnValue('2026-08-15')
  await mount()

  await act(async () => {
    pick?.('2026-08-11')
  })
  mockToday.mockReturnValue('2026-08-17')
  await send('active')

  // The key moves so the strip can reach the real today; the selection does
  // not, because somebody is looking at that day on purpose.
  expect(screen.getByText('2026-08-17|2026-08-11')).toBeTruthy()
})

it('keeps its footing across midnight while the app is still open', async () => {
  mockToday.mockReturnValue('2026-08-15')
  await mount()

  // The clock has rolled over, but nobody has left the app: no transition into
  // `active` fires, so nothing renumbers itself under the reader's thumb.
  mockToday.mockReturnValue('2026-08-16')
  await send('background')

  expect(screen.getByText('2026-08-15|2026-08-15')).toBeTruthy()
})
