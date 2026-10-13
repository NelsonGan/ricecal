import { onlineManager } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { act, render, screen, userEvent } from '@/test-utils'
import { ToastProvider } from '@/ui'
import { WeighInSheet } from '../WeighInSheet'

/**
 * Saving a weigh-in says "saved" only once the server has it.
 *
 * It used to close the sheet and say "Weigh in saved" on the tap, before the
 * write had gone anywhere. A user whose requests could not reach us was told
 * their reading was saved, and it never appeared.
 */

type Callbacks = { onSuccess?: () => void; onError?: (error: unknown) => void }

const mockMutate = jest.fn<void, [unknown, Callbacks]>()

jest.mock('@/data', () => ({
  useWeighIns: () => ({ data: [{ date: '2026-10-12', kg: 99.9 }] }),
  useLogWeight: () => ({ mutate: mockMutate, isPending: false }),
  useDeleteWeighIn: () => ({ mutate: jest.fn() }),
}))

const user = userEvent.setup()
const onClose = jest.fn()

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

const open = (ui: ReactNode) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ToastProvider>{ui}</ToastProvider>
    </SafeAreaProvider>,
  )

const sheet = () => (
  <WeighInSheet date="2026-10-13" onClose={onClose} unit="kg" onUnitChange={jest.fn()} />
)

/** The callbacks the sheet handed to the last `mutate`. */
const settle = () => mockMutate.mock.calls.at(-1)?.[1] ?? {}

beforeEach(() => {
  mockMutate.mockClear()
  onClose.mockClear()
  onlineManager.setOnline(true)
})

it('stays open and says nothing until the write lands', async () => {
  await open(sheet())

  await user.press(screen.getByText('Save weigh in'))

  expect(mockMutate).toHaveBeenCalledWith({ kg: 99.9, date: '2026-10-13' }, expect.anything())
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.queryByText('Weigh in saved')).toBeNull()

  await act(async () => settle().onSuccess?.())

  expect(onClose).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Weigh in saved')).toBeTruthy()
})

it('says the reading was not saved when the write fails, and stays open to retry', async () => {
  await open(sheet())

  await user.press(screen.getByText('Save weigh in'))
  await act(async () => settle().onError?.(new TypeError('Network request failed')))

  expect(onClose).not.toHaveBeenCalled()
  expect(screen.queryByText('Weigh in saved')).toBeNull()
  expect(screen.getByText('Weigh in not saved. Try again.')).toBeTruthy()
})

// Offline the mutation would only pause, which is a spinner on the button for as
// long as there is no signal. Saying so at once is the honest answer.
it('says so at once when offline, without sending anything', async () => {
  onlineManager.setOnline(false)
  await open(sheet())

  await user.press(screen.getByText('Save weigh in'))

  expect(mockMutate).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByText('You are offline. Weigh in not saved.')).toBeTruthy()
})
