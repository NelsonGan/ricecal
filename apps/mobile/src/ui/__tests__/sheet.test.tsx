import { Text } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { render, screen, userEvent, waitFor } from '../../test-utils'
import { SheetSurface } from '../Sheet'

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
