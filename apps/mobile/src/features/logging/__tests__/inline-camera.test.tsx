import { act, fireEvent, render as rntlRender, screen } from '@testing-library/react-native'
import { Component, type ReactElement, type ReactNode } from 'react'
import { Text, View, type ViewProps } from 'react-native'
import { State } from 'react-native-gesture-handler'
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { InlineCamera, zoomProp } from '../InlineCamera'

/**
 * What floats on the viewfinder once it fills its sheet. The switch is the only
 * way to the barcode side and the scans left are the only warning before a
 * refusal, so both have to survive every state the camera can be in, and the
 * scans left must never sit over a packet scanner, which spends nothing.
 */

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  )
}

const render = (ui: ReactElement) => rntlRender(ui, { wrapper: Providers })

const camera = jest.requireMock('expo-camera') as {
  CameraView: unknown
  useCameraPermissions: () => [{ granted: boolean; canAskAgain: boolean }, () => void]
}
// An ES module, so `import * as Device` shares this object rather than copying
// it, and a test can switch the camera on.
jest.mock('expo-device', () => ({ __esModule: true, isDevice: false }))
const device = jest.requireMock('expo-device') as { isDevice: boolean }
const granted = camera.useCameraPermissions
const plainView = camera.CameraView

afterEach(() => {
  camera.useCameraPermissions = granted
  camera.CameraView = plainView
  device.isDevice = false
})

const open = (mode: 'meal' | 'barcode') =>
  render(
    <InlineCamera
      fill
      mode={mode}
      onCapture={jest.fn()}
      onScanned={jest.fn()}
      header={<Text>Meal or barcode</Text>}
      footnote={<Text>3 scans left today</Text>}
    />,
  )

it('floats the switch and the scans left on the meal side', async () => {
  await open('meal')
  expect(screen.getByText('Meal or barcode')).toBeOnTheScreen()
  expect(screen.getByText('3 scans left today')).toBeOnTheScreen()
})

it('keeps the switch but drops the scans left over a barcode', async () => {
  await open('barcode')
  expect(screen.getByText('Meal or barcode')).toBeOnTheScreen()
  expect(screen.queryByText('3 scans left today')).toBeNull()
})

it('keeps both around the card when the camera is refused', async () => {
  camera.useCameraPermissions = () => [{ granted: false, canAskAgain: false }, jest.fn()]
  await open('meal')
  // The card, so this is the refused branch and not the feed.
  expect(screen.getByText('Open Settings')).toBeOnTheScreen()
  expect(screen.getByText('Meal or barcode')).toBeOnTheScreen()
  expect(screen.getByText('3 scans left today')).toBeOnTheScreen()
})

it('drops the scans left from the refused barcode card too', async () => {
  camera.useCameraPermissions = () => [{ granted: false, canAskAgain: false }, jest.fn()]
  await open('barcode')
  expect(screen.getByText('Meal or barcode')).toBeOnTheScreen()
  expect(screen.queryByText('3 scans left today')).toBeNull()
})

/**
 * A pinch asks for "this many times closer than 1x", and expo-camera's `zoom`
 * means a different curve on each platform. A wrong curve does not error: it
 * jumps to the device's maximum or barely moves.
 */
describe('zoomProp', () => {
  it('opens at 1x on both platforms', () => {
    expect(zoomProp(1, 60, 'ios')).toBe(0)
    expect(zoomProp(1, 10, 'android')).toBe(0)
  })

  it('is exponential on iOS, so 8x of a 64x range is halfway', () => {
    expect(zoomProp(8, 64, 'ios')).toBeCloseTo(0.5)
  })

  it('is linear on Android, where the native side multiplies by the maximum', () => {
    expect(zoomProp(4, 8, 'android')).toBeCloseTo(0.5)
  })

  it('never asks past the device, and does nothing where it cannot zoom', () => {
    expect(zoomProp(20, 10, 'ios')).toBe(1)
    expect(zoomProp(20, 10, 'android')).toBe(1)
    expect(zoomProp(3, 1, 'ios')).toBe(0)
  })
})

/**
 * The feed itself, which only a device draws. The camera is a stand-in with the
 * two patched methods, and a back lens that reaches 60x.
 */
describe('on a device', () => {
  const focusAtPointAsync = jest.fn(async (_x: number, _y: number) => {})
  type FakeProps = ViewProps & { zoom?: number; onCameraReady?: () => void }
  let lens: FakeProps = {}
  class FakeCamera extends Component<FakeProps> {
    focusAtPointAsync = focusAtPointAsync
    getMaxZoomRatioAsync = async () => 60
    render() {
      lens = this.props
      return <View style={this.props.style} />
    }
  }

  const ready = async () => {
    camera.CameraView = FakeCamera
    device.isDevice = true
    await open('meal')
    await act(async () => {
      lens.onCameraReady?.()
    })
  }
  const pinchTo = (scale: number) =>
    act(() =>
      fireGestureHandler(getByGestureTestId('camera-pinch'), [
        { state: State.BEGAN, scale: 1 },
        { state: State.ACTIVE, scale: 1 },
        { state: State.ACTIVE, scale },
        { state: State.END, scale },
      ]),
    )
  const lensZoom = () => lens.zoom

  it('zooms the lens with a pinch, and the chip takes it back to 1x', async () => {
    await ready()
    expect(lensZoom()).toBe(0)
    await pinchTo(2)
    expect(screen.getByText('2×')).toBeOnTheScreen()
    expect(lensZoom()).toBeGreaterThan(0)
    await fireEvent.press(screen.getByRole('button', { name: 'Reset zoom' }))
    expect(screen.queryByText('2×')).toBeNull()
    expect(lensZoom()).toBe(0)
  })

  it('stops at the cap, however far the lens could go', async () => {
    await ready()
    await pinchTo(40)
    expect(screen.getByText('8×')).toBeOnTheScreen()
  })

  it('snaps a pinch that ends just above 1x back to 1x', async () => {
    await ready()
    await pinchTo(1.03)
    expect(screen.queryByRole('button', { name: 'Reset zoom' })).toBeNull()
    expect(lensZoom()).toBe(0)
  })

  it('focuses where the feed was tapped, as fractions of the feed', async () => {
    await ready()
    await fireEvent(screen.getByTestId('camera-feed'), 'layout', {
      nativeEvent: { layout: { width: 400, height: 200 } },
    })
    act(() =>
      fireGestureHandler(getByGestureTestId('camera-tap'), [
        { state: State.BEGAN, x: 100, y: 50 },
        { state: State.END, x: 100, y: 50 },
      ]),
    )
    expect(focusAtPointAsync).toHaveBeenCalledWith(0.25, 0.25)
  })
})
