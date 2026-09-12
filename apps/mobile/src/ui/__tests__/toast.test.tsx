import { useEffect } from 'react'
import { State } from 'react-native-gesture-handler'
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { act, fireEvent, render, screen, userEvent, waitFor } from '@/test-utils'
import { ToastProvider, useToast } from '@/ui'

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

const NOOP = () => {}

function Notice({ onUndo = NOOP }: { onUndo?: () => void }) {
  const toast = useToast()

  useEffect(() => {
    toast.show({
      title: 'Added, 420 kcal',
      action: { label: 'Undo', onPress: onUndo },
      duration: 60_000,
    })
  }, [toast, onUndo])

  return null
}

it('dismisses a toast with a deliberate horizontal swipe', async () => {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ToastProvider>
        <Notice />
      </ToastProvider>
    </SafeAreaProvider>,
  )

  expect(screen.getByText('Added, 420 kcal')).toBeOnTheScreen()

  await act(async () => {
    fireGestureHandler(getByGestureTestId('toast-swipe'), [
      { state: State.BEGAN, translationX: 0, velocityX: 0 },
      { state: State.ACTIVE, translationX: -96, velocityX: -240 },
      { state: State.END, translationX: -96, velocityX: -240 },
    ])
  })

  await waitFor(() => expect(screen.queryByText('Added, 420 kcal')).toBeNull())
})

it('keeps the inline action tappable inside the swipe gesture', async () => {
  const undo = jest.fn()
  const user = userEvent.setup()
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ToastProvider>
        <Notice onUndo={undo} />
      </ToastProvider>
    </SafeAreaProvider>,
  )

  await user.press(screen.getByRole('button', { name: 'Undo' }))

  expect(undo).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(screen.queryByText('Added, 420 kcal')).toBeNull())
})

it('offers a non-gesture dismissal to assistive technology', async () => {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ToastProvider>
        <Notice />
      </ToastProvider>
    </SafeAreaProvider>,
  )

  fireEvent(screen.getByRole('button', { name: 'Undo' }), 'accessibilityAction', {
    nativeEvent: { actionName: 'dismiss' },
  })

  await waitFor(() => expect(screen.queryByText('Added, 420 kcal')).toBeNull())
})

it('keeps the toast when the system cancels a partial swipe', async () => {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ToastProvider>
        <Notice />
      </ToastProvider>
    </SafeAreaProvider>,
  )

  await act(async () => {
    fireGestureHandler(getByGestureTestId('toast-swipe'), [
      { state: State.BEGAN, translationX: 0, velocityX: 0 },
      { state: State.ACTIVE, translationX: 40, velocityX: 120 },
      { state: State.CANCELLED, translationX: 40, velocityX: 120 },
    ])
  })

  expect(screen.getByText('Added, 420 kcal')).toBeOnTheScreen()
})
