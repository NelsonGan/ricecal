import { SafeAreaProvider } from 'react-native-safe-area-context'

import { act, render, screen, userEvent } from '../../test-utils'
import { ConfirmSheet } from '../ConfirmSheet'

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

it('keeps a rejected confirmation open and consumes its press rejection', async () => {
  let rejectConfirmation: (error: Error) => void = () => undefined
  const onConfirm = jest.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectConfirmation = reject
      }),
  )
  const onClose = jest.fn()
  const unhandled = jest.fn()
  process.on('unhandledRejection', unhandled)

  try {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ConfirmSheet
          visible
          onClose={onClose}
          onConfirm={onConfirm}
          title="Remove follower?"
          description="They will no longer follow you."
          confirmLabel="Remove"
          cancelLabel="Cancel"
        />
      </SafeAreaProvider>,
    )

    await userEvent.setup().press(screen.getByRole('button', { name: 'Remove' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Remove' })).toBeBusy()
    for (const cancel of screen.getAllByRole('button', { name: 'Cancel' })) {
      expect(cancel).toBeDisabled()
    }

    await act(async () => {
      rejectConfirmation(new Error('request refused'))
      await new Promise((resolve) => setImmediate(resolve))
    })

    expect(unhandled).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Remove follower?')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Remove' })).not.toBeBusy()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled()
    for (const cancel of screen.getAllByRole('button', { name: 'Cancel' })) {
      expect(cancel).toBeEnabled()
    }
  } finally {
    process.off('unhandledRejection', unhandled)
  }
})
