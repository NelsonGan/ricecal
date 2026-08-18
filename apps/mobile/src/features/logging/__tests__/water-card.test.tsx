import type { ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { render, screen, userEvent } from '@/test-utils'
import { ToastProvider } from '@/ui'
import { WaterCard } from '../WaterCard'

/**
 * Recording a drink on Today.
 *
 * What is worth pinning is the arithmetic the buttons carry, because it is the
 * one thing that changed shape when water became a volume. Every control here
 * ADDS — the old glasses SET the day to a number — so a button that sent a
 * total instead of an amount would look correct on an empty day and be wrong
 * every time after it, which is the failure a screenshot cannot catch.
 *
 * The undo is the other half of the same contract: it sends the negative of the
 * amount that was just added and nothing else. It lives in the toast, so it is
 * also the one part of this card that has no place on screen to be checked by
 * eye.
 */

const mockMutate = jest.fn()

jest.mock('@/data', () => ({ useAddWater: () => ({ mutate: mockMutate }) }))

// The tank itself is stubbed. Skia's jest setup installs the web
// implementation, which has no CanvasKit behind it, so `Skia.PathBuilder` is
// undefined the moment anything tries to draw — and there is nothing to assert
// about a drawing anyway. `app/gallery.tsx` is where it is looked at.
jest.mock('@/ui/WaterTank', () => ({ WaterTank: () => null }))

const user = userEvent.setup()

beforeEach(() => mockMutate.mockClear())

/** A phone, so the toast can inset itself off the home indicator. */
const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

/**
 * The undo lives in a toast, so the provider is part of the subject here rather
 * than scenery: without it `useToast` throws, and with it the toast renders
 * into the tree and its button can be pressed like any other.
 */
const withToast = (ui: ReactNode) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ToastProvider>{ui}</ToastProvider>
    </SafeAreaProvider>,
  )

it('adds the amount the button names', async () => {
  await withToast(<WaterCard date="2026-08-18" ml={0} goalMl={2000} />)

  await user.press(screen.getByLabelText('Add water'))
  await user.press(screen.getByLabelText('Add 500 ml'))
  expect(mockMutate).toHaveBeenCalledWith(500)

  await user.press(screen.getByLabelText('Add water'))
  await user.press(screen.getByLabelText('Add 250 ml'))
  expect(mockMutate).toHaveBeenLastCalledWith(250)
})

it('offers the drink back, once, and takes it off the day', async () => {
  await withToast(<WaterCard date="2026-08-18" ml={1200} goalMl={2000} />)

  // Nothing to take back until this session has poured something: the 1,200 ml
  // already on the day was not added here.
  expect(screen.queryByText('Undo')).toBeNull()

  await user.press(screen.getByLabelText('Add water'))
  await user.press(screen.getByLabelText('Add 350 ml'))

  expect(screen.getByText('350 ml of water')).toBeOnTheScreen()
  await user.press(screen.getByText('Undo'))
  expect(mockMutate).toHaveBeenLastCalledWith(-350)
})

it('counts down to the goal, and says so once it is met', async () => {
  await withToast(<WaterCard date="2026-08-18" ml={1250} goalMl={2000} />)
  await user.press(screen.getByLabelText('Add water'))
  expect(screen.getByText('750 ml to go today')).toBeOnTheScreen()

  await withToast(<WaterCard date="2026-08-18" ml={2000} goalMl={2000} />)
  await user.press(screen.getByLabelText('Add water'))
  expect(screen.getByText('Goal reached. Nice one.')).toBeOnTheScreen()
})
