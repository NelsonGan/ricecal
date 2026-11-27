import path from 'node:path'

import { render } from '@/test-utils'
import { useScreenAwake } from '../keep-awake'

/**
 * Leaving a keep-awake screen after Android has destroyed the activity (the app
 * was backgrounded and reclaimed) makes the native `deactivate` reject with
 * "The current activity is no longer available". The library's hook leaves that
 * promise uncaught unless asked not to, so it surfaced as an unhandled
 * rejection (PostHog 01a21b1e, Android 16, 1.3.0).
 *
 * The real hook runs against a native module that refuses, so what reaches the
 * runtime is what reached it on the phone.
 */
// The module object the library already holds, replaced in place. The
// package's exports map hides the file, so it is reached by path from the
// package root; a layout change fails here rather than as a stray TypeError.
const native = require(
  path.join(
    path.dirname(require.resolve('expo-keep-awake/package.json')),
    'build/ExpoKeepAwake.js',
  ),
).default
if (!native) throw new Error('expo-keep-awake moved its native module')
const mockActivate = jest.fn((_tag: string) => Promise.resolve())
const mockDeactivate = jest.fn((_tag: string) =>
  Promise.reject(new Error('The current activity is no longer available')),
)
native.activate = mockActivate
native.deactivate = mockDeactivate

/**
 * Long enough for a rejection to count as unhandled, which Jest reports as a
 * failure of the test that left it.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

function Screen() {
  useScreenAwake('workout')
  return null
}

it('keeps the screen awake while mounted', async () => {
  await render(<Screen />)
  expect(mockActivate).toHaveBeenCalledWith('workout')
})

it('swallows a deactivate refused because the activity is gone', async () => {
  const view = await render(<Screen />)
  view.unmount()
  await settle()

  expect(mockDeactivate).toHaveBeenCalledWith('workout')
})
