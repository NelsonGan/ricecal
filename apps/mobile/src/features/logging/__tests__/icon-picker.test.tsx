import { render as rntlRender, screen, userEvent } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { IconPicker } from '../IconPicker'

/**
 * The picker exists because the catalogue cannot be illustrated: a few hundred
 * drawings against hundreds of megabytes of imported foods. So what is worth
 * pinning is what makes it usable at that scale — searching by dish name — and
 * that it hands back the tagged pair `Icon` takes rather than two loose props.
 *
 * There is no "use no picture" row any more. Nothing arrives here carrying a
 * picture it did not ask for, so the only thing that button could undo was a
 * choice made in this sheet a moment earlier.
 *
 * One thing to know before adding a case here: the grid arrives in two parts. Thirty
 * tiles on the frame the sheet opens and the remaining two hundred and thirty-nine
 * once the thread is free, because building all of them at once is what made this
 * sheet stick before it moved. A tile past the first thirty needs `findBy`, not
 * `getBy` — the last test pins that staging, and it is why.
 */

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  )
}

const render = (ui: ReactElement) => rntlRender(ui, { wrapper: Providers })
const user = userEvent.setup()

const onSelect = jest.fn()
const onClose = jest.fn()

const open = (selected?: { set: 'dishes'; name: 'nasi-lemak' }) =>
  render(<IconPicker visible onClose={onClose} onSelect={onSelect} selected={selected as never} />)

beforeEach(() => {
  jest.clearAllMocks()
})

it('offers the local dishes by name', async () => {
  await open()
  // The slug read as words, which is also what a screen reader gets: these are
  // images and the label is the only name they have. `findBy` because both of these
  // are past the first thirty tiles.
  expect(await screen.findByLabelText('nasi lemak')).toBeOnTheScreen()
  expect(await screen.findByLabelText('teh tarik')).toBeOnTheScreen()
})

it('narrows to what was typed', async () => {
  await open()

  await user.type(screen.getByLabelText('Search pictures'), 'mee')

  expect(screen.getByLabelText('mee goreng')).toBeOnTheScreen()
  expect(screen.queryByLabelText('nasi lemak')).toBeNull()
})

it('hands back the pair, not two loose props', async () => {
  await open()
  await user.press(await screen.findByLabelText('roti canai'))

  expect(onSelect).toHaveBeenCalledWith({ set: 'dishes', name: 'roti-canai' })
  expect(onClose).toHaveBeenCalled()
})

it('marks the picture already on the row as chosen', async () => {
  await open({ set: 'dishes', name: 'nasi-lemak' })

  // `toBeSelected`, not `toHaveAccessibilityState` — RNTL v14 dropped the
  // whole-object matcher, and calling it fails as "not a function" rather than as
  // a bad assertion.
  expect(await screen.findByLabelText('nasi lemak')).toBeSelected()
  expect(await screen.findByLabelText('roti canai')).not.toBeSelected()
})

/**
 * The two halves, and which one the sheet opens on.
 *
 * Search, because it is the answer for most dishes — and the pictures have to be
 * there on the first frame rather than one tap away.
 */
it('opens on the pictures and switches to the camera', async () => {
  await render(<IconPicker visible onClose={onClose} onSelect={onSelect} onPickPhoto={jest.fn()} />)

  expect(screen.getByLabelText('Search')).toBeSelected()
  expect(await screen.findByLabelText('nasi lemak')).toBeOnTheScreen()

  await user.press(screen.getByLabelText('Camera'))

  // The grid and its field are gone, and the shutter is there instead.
  expect(screen.queryByLabelText('nasi lemak')).toBeNull()
  expect(screen.queryByLabelText('Search pictures')).toBeNull()
  expect(screen.getByLabelText('Take a photo')).toBeOnTheScreen()
})

/** A host with nowhere to put a photo gets the grid alone, and no tabs at all. */
it('offers no camera when the host cannot take one', async () => {
  await open()

  expect(screen.queryByLabelText('Camera')).toBeNull()
  expect(screen.queryByLabelText('Search')).toBeNull()
  // The pictures are still there — they are the sheet's own job.
  expect(await screen.findByLabelText('nasi lemak')).toBeOnTheScreen()
})

it('says so when the search matches nothing', async () => {
  await open()
  await user.type(screen.getByLabelText('Search pictures'), 'pizza crust')
  expect(screen.getByText(/Nothing matches/)).toBeOnTheScreen()
})

// There is no test here for "thirty tiles first". Whether the staged mount has
// already flushed by the time `render` resolves depends on what else is in the
// queue, so asserting the count either way is a coin toss. `useAfterInteractions`
// is tested directly instead, which is where the behaviour lives.
