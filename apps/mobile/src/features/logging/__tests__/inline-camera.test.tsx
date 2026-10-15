import { render as rntlRender, screen } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { Text } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { InlineCamera } from '../InlineCamera'

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
