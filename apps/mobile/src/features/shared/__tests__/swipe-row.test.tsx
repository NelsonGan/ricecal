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

/** Lays the row out, as the device would: a full swipe is measured against its width. */
async function layOut(from: ReturnType<typeof screen.getByText>, width: number, height: number) {
  let node: typeof from | null = from
  while (node && !node.props.onLayout) node = node.parent
  if (!node) throw new Error('no view takes a layout')
  await act(async () => {
    node?.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } })
  })
}

async function swipe(translationX: number) {
  await act(async () => {
    // The first ACTIVE event starts the pan; only the ones after it move the row.
    fireGestureHandler(getByGestureTestId('swipe-row'), [
      { state: State.BEGAN, translationX: 0, velocityX: 0 },
      { state: State.ACTIVE, translationX: -20, velocityX: -900 },
      { state: State.ACTIVE, translationX, velocityX: -900 },
      { state: State.END, translationX, velocityX: -900 },
    ])
  })
}

function setRow(onPress: () => void) {
  return (
    <SwipeRow
      square
      actions={[
        {
          label: 'Delete',
          icon: 'delete',
          tone: 'hibiscus',
          exits: true,
          fullSwipe: true,
          onPress,
        },
      ]}
    >
      <Text>Set 2</Text>
    </SwipeRow>
  )
}

it('runs a full-swipe action when the swipe is carried across the row', async () => {
  const onPress = jest.fn()
  await render(setRow(onPress))
  await layOut(screen.getByText('Set 2'), 360, 46)
  await swipe(-260)
  expect(onPress).toHaveBeenCalledTimes(1)
})

it('only uncovers the button on a short swipe, even where a full swipe is allowed', async () => {
  const onPress = jest.fn()
  await render(setRow(onPress))
  await layOut(screen.getByText('Set 2'), 360, 46)
  await swipe(-120)
  expect(onPress).not.toHaveBeenCalled()
  await user.press(screen.getByRole('button', { name: 'Delete' }))
  expect(onPress).toHaveBeenCalledTimes(1)
})

it('never runs an action on release when the row does not allow a full swipe', async () => {
  const onPress = jest.fn()
  await render(row(onPress))
  await layOut(screen.getByText('Teh tarik'), 360, 46)
  await swipe(-300)
  expect(onPress).not.toHaveBeenCalled()
})
