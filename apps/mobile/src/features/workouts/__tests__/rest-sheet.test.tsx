import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { fireEvent, render, screen, userEvent } from '@/test-utils'
import { RestSheet } from '../RestSheet'

/**
 * The rest on two wheels, minutes and seconds.
 *
 * What it has to keep from the list it replaced: an exercise on the default
 * stays on it unless the wheels are moved, so a later change to the default
 * still reaches it, and the wheels never offer a rest the setting refuses.
 */

const user = userEvent.setup()
const onPick = jest.fn()
const onUseDefault = jest.fn()
const onClose = jest.fn()

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

const open = (seconds: number | null, defaultS = 90) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <RestSheet
        visible
        title="Rest timer"
        seconds={seconds}
        defaultS={defaultS}
        onClose={onClose}
        onPick={onPick}
        onUseDefault={onUseDefault}
      />
    </SafeAreaProvider>,
  )

/** What VoiceOver's swipe up sends, and the one way to turn a wheel in a test. */
const turn = async (label: 'Minutes' | 'Seconds', actionName: 'increment' | 'decrement') =>
  await fireEvent(screen.getByLabelText(label), 'accessibilityAction', {
    nativeEvent: { actionName },
  })

beforeEach(() => {
  onPick.mockClear()
  onUseDefault.mockClear()
  onClose.mockClear()
})

it('leaves an exercise on the default when the wheels are not moved', async () => {
  await open(null)

  expect(screen.getByText('1:30')).toBeTruthy()
  // Already on the default, so there is nothing to go back to.
  expect(screen.queryByText('Use default (1:30)')).toBeNull()

  await user.press(screen.getByText('Done'))

  expect(onPick).not.toHaveBeenCalled()
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('gives an exercise its own rest once a wheel is moved', async () => {
  await open(null)

  await turn('Minutes', 'increment')
  expect(screen.getByText('2:30')).toBeTruthy()
  await user.press(screen.getByText('Done'))

  expect(onPick).toHaveBeenCalledWith(150)
})

it('offers the way back to the default for an exercise with its own rest', async () => {
  await open(120)

  await user.press(screen.getByText('Use default (1:30)'))

  expect(onUseDefault).toHaveBeenCalledTimes(1)
  expect(onPick).not.toHaveBeenCalled()
})

it('stops at ten minutes, the most the setting accepts', async () => {
  await open(595)

  await turn('Minutes', 'increment')

  expect(screen.getByText('10:00')).toBeTruthy()
  await user.press(screen.getByText('Done'))
  expect(onPick).toHaveBeenCalledWith(600)
})

it('reads 0:00 as no timer', async () => {
  await open(5)

  await turn('Seconds', 'decrement')

  expect(screen.getByText('Rest off')).toBeTruthy()
  await user.press(screen.getByText('Done'))
  expect(onPick).toHaveBeenCalledWith(0)
})

it('leaves a rest the wheels cannot show exactly alone when Done is pressed untouched', async () => {
  await open(127)

  await user.press(screen.getByText('Done'))

  expect(onPick).not.toHaveBeenCalled()
})

it('saves nothing when a wheel is moved away and back', async () => {
  await open(null)

  await turn('Minutes', 'increment')
  await turn('Minutes', 'decrement')
  await user.press(screen.getByText('Done'))

  expect(onPick).not.toHaveBeenCalled()
})
