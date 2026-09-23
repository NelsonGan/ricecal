import { Text } from 'react-native'
import { State } from 'react-native-gesture-handler'
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'

import { act, render, screen, userEvent } from '@/test-utils'
import { SwipeRow } from '../SwipeRow'

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated/mock'),
  // The stock mock makes a new value on every render, which would reset the
  // one-run latch under test between presses.
  useSharedValue: (init: unknown) => jest.requireActual('react').useRef({ value: init }).current,
  withTiming: (toValue: number, _config?: unknown, callback?: (finished?: boolean) => void) => {
    callback?.(true)
    return toValue
  },
}))
jest.mock('expo-haptics', () => ({
  impactAsync: () => Promise.resolve(),
  notificationAsync: () => Promise.resolve(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}))

const user = userEvent.setup()

async function swipeAndDelete() {
  await act(async () => {
    fireGestureHandler(getByGestureTestId('swipe-row'), [
      { state: State.BEGAN, translationX: 0, velocityX: 0 },
      { state: State.ACTIVE, translationX: -120, velocityX: -900 },
      { state: State.END, translationX: -120, velocityX: -900 },
    ])
  })
  await user.press(screen.getByRole('button', { name: 'Delete' }))
}

function row(onPress: (() => void) | (() => Promise<boolean>)) {
  return (
    <SwipeRow
      actions={[{ label: 'Delete', icon: 'delete', tone: 'hibiscus', exits: true, onPress }]}
    >
      <Text>Teh tarik</Text>
    </SwipeRow>
  )
}

it('lets a delete that was called off run again', async () => {
  const onPress = jest.fn(async () => false)
  await render(row(onPress))
  await swipeAndDelete()
  await swipeAndDelete()
  expect(onPress).toHaveBeenCalledTimes(2)
})

it('runs an exiting action once when the row really goes', async () => {
  const onPress = jest.fn(async () => true)
  await render(row(onPress))
  await swipeAndDelete()
  await swipeAndDelete()
  expect(onPress).toHaveBeenCalledTimes(1)
})

it('keeps a plain exiting action to one run, as before', async () => {
  const onPress = jest.fn()
  await render(row(onPress))
  await swipeAndDelete()
  await swipeAndDelete()
  expect(onPress).toHaveBeenCalledTimes(1)
})
