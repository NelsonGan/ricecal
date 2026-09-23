import { useState } from 'react'
import { Platform, Text } from 'react-native'
import { State } from 'react-native-gesture-handler'
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { act, render, screen, userEvent, waitFor } from '../../test-utils'
import { Sheet, SheetSurface } from '../Sheet'

const mockWithTiming = jest.fn(
  (toValue: number, _config?: unknown, callback?: (finished?: boolean) => void) => {
    callback?.(true)
    return toValue
  },
)

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated/mock'),
  withTiming: (...args: [number, unknown?, ((finished?: boolean) => void)?]) =>
    mockWithTiming(...args),
}))

/**
 * A sheet closes ONCE, however many times it is asked to.
 *
 * `onClose` unwinds a navigator for a sheet that is a route, and a second one
 * dismisses whatever is underneath. Firing twice for one gesture is easy: the
 * handle answers a tap and a drag, and the scrim behind it answers a press of
 * its own. All three go through the same one-shot `dismiss` now — the scrim
 * used to call `onClose` directly, which is how a sheet still closed twice with
 * the guard in place.
 */

const user = userEvent.setup()

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

beforeEach(() => {
  mockWithTiming.mockReset()
  mockWithTiming.mockImplementation((toValue, _config, callback) => {
    callback?.(true)
    return toValue
  })
})

describe('SheetSurface', () => {
  it('closes once when the handle is pressed twice', async () => {
    const onClose = jest.fn()
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <SheetSurface onClose={onClose} closeLabel="Close">
          <Text>body</Text>
        </SheetSurface>
      </SafeAreaProvider>,
    )

    const handle = screen.getByLabelText('Close')
    await user.press(handle)
    await user.press(handle)

    // After the fall, not before — see `dismiss`.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

it('keeps a pending sheet visible and lets it close after the request finishes', async () => {
  const onClose = jest.fn()
  const panel = (dismissible: boolean) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <SheetSurface onClose={onClose} closeLabel="Close" dismissible={dismissible}>
        <Text>Pending request</Text>
      </SheetSurface>
    </SafeAreaProvider>
  )
  const view = await render(panel(false))
  await user.press(screen.getByLabelText('Close'))
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByText('Pending request')).toBeTruthy()
  await view.rerender(panel(true))
  await user.press(screen.getByLabelText('Close'))
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
})

it('keeps the native window until a controlled close finishes falling', async () => {
  const originalPlatform = Platform.OS
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })
  const onDismiss = jest.fn()
  const fallCallbacks: Array<(finished?: boolean) => void> = []
  mockWithTiming.mockImplementation((toValue, _config, callback) => {
    if (Number(toValue) > 0 && callback) fallCallbacks.push(callback)
    else callback?.(true)
    return toValue
  })
  const panel = (visible: boolean) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <Sheet visible={visible} onClose={jest.fn()} onDismiss={onDismiss} closeLabel="Close">
        <Text>Modal body</Text>
      </Sheet>
    </SafeAreaProvider>
  )

  try {
    const view = await render(panel(true))
    expect(onDismiss).not.toHaveBeenCalled()
    await view.rerender(panel(false))

    // The owner has already said "closed", but the native window and panel
    // remain until the 180ms fall reports completion.
    expect(screen.getByTestId('sheet-modal').props.visible).toBe(true)
    expect(screen.getByText('Modal body')).toBeOnTheScreen()
    expect(fallCallbacks).toHaveLength(1)
    expect(onDismiss).not.toHaveBeenCalled()

    await act(async () => fallCallbacks[0]?.(true))

    expect(screen.queryByTestId('sheet-modal')).toBeNull()
    expect(screen.queryByText('Modal body')).toBeNull()
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1))
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform })
  }
})

it('sends hardware back through the controlled exit animation', async () => {
  const fallCallbacks: Array<(finished?: boolean) => void> = []
  mockWithTiming.mockImplementation((toValue, _config, callback) => {
    if (Number(toValue) > 0 && callback) fallCallbacks.push(callback)
    else callback?.(true)
    return toValue
  })
  const onClose = jest.fn()

  function HardwareSheet() {
    const [visible, setVisible] = useState(true)
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <Sheet
          visible={visible}
          onClose={() => {
            onClose()
            setVisible(false)
          }}
          closeLabel="Close"
        >
          <Text>Hardware body</Text>
        </Sheet>
      </SafeAreaProvider>
    )
  }

  await render(<HardwareSheet />)
  await act(async () => screen.getByTestId('sheet-modal').props.onRequestClose())

  expect(onClose).toHaveBeenCalledTimes(1)
  expect(fallCallbacks).toHaveLength(1)
  expect(screen.getByTestId('sheet-modal').props.visible).toBe(true)

  await act(async () => fallCallbacks[0]?.(true))
  expect(screen.queryByTestId('sheet-modal')).toBeNull()
})

it('keeps hardware back inside a visible multi-panel sheet', async () => {
  const onBack = jest.fn()
  const onClose = jest.fn()
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <Sheet visible onClose={onClose} onBack={onBack} closeLabel="Close">
        <Text>Nested panel</Text>
      </Sheet>
    </SafeAreaProvider>,
  )

  await act(async () => screen.getByTestId('sheet-modal').props.onRequestClose())

  expect(onBack).toHaveBeenCalledTimes(1)
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByTestId('sheet-modal').props.visible).toBe(true)
  expect(screen.getByText('Nested panel')).toBeOnTheScreen()
})

it('ignores a handle drag that begins during the entrance', async () => {
  const entranceCallbacks: Array<(finished?: boolean) => void> = []
  mockWithTiming.mockImplementation((toValue, _config, callback) => {
    if (Number(toValue) === 0 && callback) entranceCallbacks.push(callback)
    else callback?.(true)
    return toValue
  })
  const onClose = jest.fn()

  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <SheetSurface onClose={onClose} closeLabel="Close">
        <Text>Rising body</Text>
      </SheetSurface>
    </SafeAreaProvider>,
  )

  expect(entranceCallbacks).toHaveLength(1)
  await act(async () => {
    fireGestureHandler(getByGestureTestId('sheet-drag'), [
      { state: State.BEGAN, translationY: 0, velocityY: 0 },
      { state: State.ACTIVE, translationY: 140, velocityY: 1200 },
      { state: State.END, translationY: 140, velocityY: 1200 },
    ])
  })

  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByText('Rising body')).toBeOnTheScreen()

  await act(async () => entranceCallbacks[0]?.(true))
})
