import { render as rntlRender, screen } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { Text } from 'react-native'
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
  useCameraPermissions: () => [{ granted: boolean; canAskAgain: boolean }, () => void]
}
const granted = camera.useCameraPermissions

afterEach(() => {
  camera.useCameraPermissions = granted
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
