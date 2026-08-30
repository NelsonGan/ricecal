import type { ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { render, screen, userEvent } from '@/test-utils'
import { ToastProvider } from '@/ui'
import { WaterCard } from '../WaterCard'

/**
 * Recording a drink on Today.
 *
 * What is pinned is the arithmetic the buttons carry, which changed shape when
 * water became a volume. Every control here adds, where the old glasses set the
 * day to a number, so a button sending a total instead of an amount would look
 * correct on an empty day and be wrong every time after.
 *
 * The undo is the other half of the contract: it sends the negative of the amount
 * just added and nothing else. It lives in the toast, so there is nowhere on
 * screen to check it by eye.
 */

const mockMutate = jest.fn()

jest.mock('@/data', () => ({ useAddWater: () => ({ mutate: mockMutate }) }))

// The tank's DRAWING is stubbed, and its overlay is not. Skia's jest setup
// installs the web implementation, which has no CanvasKit behind it, so
// `Skia.PathBuilder` is undefined the moment anything tries to draw — and there
// is nothing to assert about a drawing anyway (`app/gallery.tsx` is where it is
// looked at). What the card puts ON the tank is the whole interface, so the
// stub still calls the render prop: once, with the dry ground, which is the
// copy that carries the real button and the announced figure.
jest.mock('@/ui/WaterTank', () => ({
  WaterTank: ({ children }: { children?: (onWater: boolean) => ReactNode }) =>
    children ? children(false) : null,
}))

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

// Beside the sheet's heading, the way the log sheet writes "1,460 kcal left"
// beside its own. Clamped at zero rather than swapped for a congratulation:
// a day past its goal has nothing left, and "-400 ml left" is what an
// unclamped subtraction prints there.
it('says what is left of the goal, and never less than nothing', async () => {
  await withToast(<WaterCard date="2026-08-18" ml={1250} goalMl={2000} />)
  await user.press(screen.getByLabelText('Add water'))
  expect(screen.getByText('750 ml left')).toBeOnTheScreen()

  await withToast(<WaterCard date="2026-08-18" ml={2400} goalMl={2000} />)
  await user.press(screen.getByLabelText('Add water'))
  expect(screen.getByText('0 ml left')).toBeOnTheScreen()
})

/**
 * The custom amount, in both directions.
 *
 * The minus is the half worth a test: it is the same call as the plus with the
 * sign flipped, which is the shape of mistake that looks right in a screenshot
 * and takes water off the day when somebody meant to drink it. The toast is
 * part of the contract too — read off the same figure, a removal announces
 * itself as a drink, and prints its own minus sign into the sentence.
 */
it('adds or takes off an amount somebody types', async () => {
  await withToast(<WaterCard date="2026-08-18" ml={2000} goalMl={2500} />)
  await user.press(screen.getByLabelText('Add water'))

  await user.type(screen.getByLabelText('Another amount'), '400')

  await user.press(screen.getByLabelText('Take this amount off'))
  expect(mockMutate).toHaveBeenLastCalledWith(-400)
  expect(screen.getByText('400 ml taken off')).toBeOnTheScreen()

  await user.press(screen.getByLabelText('Add water'))
  await user.type(screen.getByLabelText('Another amount'), '400')
  await user.press(screen.getByLabelText('Add this amount'))
  expect(mockMutate).toHaveBeenLastCalledWith(400)
  expect(screen.getByText('400 ml of water')).toBeOnTheScreen()
})

// Nothing typed is nothing to do, in either direction: `Number('')` is 0, so
// the empty field has to be caught by hand or both buttons would fire a no-op
// write and a toast saying "0 ml of water".
it('will not record an empty box', async () => {
  await withToast(<WaterCard date="2026-08-18" ml={2000} goalMl={2500} />)
  await user.press(screen.getByLabelText('Add water'))

  expect(screen.getByLabelText('Add this amount')).toBeDisabled()
  expect(screen.getByLabelText('Take this amount off')).toBeDisabled()

  await user.press(screen.getByLabelText('Add this amount'))
  expect(mockMutate).not.toHaveBeenCalled()
})
