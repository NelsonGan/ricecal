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
  // images and the label is the only name they have.
  expect(screen.getByLabelText('nasi lemak')).toBeOnTheScreen()
  expect(screen.getByLabelText('teh tarik')).toBeOnTheScreen()
})

it('narrows to what was typed', async () => {
  await open()

  await user.type(screen.getByLabelText('Search pictures'), 'mee')

  expect(screen.getByLabelText('mee goreng')).toBeOnTheScreen()
  expect(screen.queryByLabelText('nasi lemak')).toBeNull()
})

it('hands back the pair, not two loose props', async () => {
  await open()
  await user.press(screen.getByLabelText('roti canai'))

  expect(onSelect).toHaveBeenCalledWith({ set: 'dishes', name: 'roti-canai' })
  expect(onClose).toHaveBeenCalled()
})

it('marks the picture already on the row as chosen', async () => {
  await open({ set: 'dishes', name: 'nasi-lemak' })

  // `toBeSelected`, not `toHaveAccessibilityState` — RNTL v14 dropped the
  // whole-object matcher, and calling it fails as "not a function" rather than as
  // a bad assertion.
  expect(screen.getByLabelText('nasi lemak')).toBeSelected()
  expect(screen.getByLabelText('roti canai')).not.toBeSelected()
})

/**
 * The two photo sources are icons, so their accessible names are the only thing
 * saying which is which — and they are what a test has to go by too.
 */
it('offers the camera and the album when the host can take a photo', async () => {
  const onPickPhoto = jest.fn()
  await render(
    <IconPicker visible onClose={onClose} onSelect={onSelect} onPickPhoto={onPickPhoto} />,
  )

  await user.press(screen.getByLabelText('Take a photo'))
  expect(onPickPhoto).toHaveBeenCalledWith('camera')

  await user.press(screen.getByLabelText('Choose from photos'))
  expect(onPickPhoto).toHaveBeenCalledWith('library')
})

/** A host with nowhere to put a photo gets the grid alone. */
it('offers neither when it cannot', async () => {
  await open()

  expect(screen.queryByLabelText('Take a photo')).toBeNull()
  expect(screen.queryByLabelText('Choose from photos')).toBeNull()
})

it('says so when the search matches nothing', async () => {
  await open()
  await user.type(screen.getByLabelText('Search pictures'), 'pizza crust')
  expect(screen.getByText(/Nothing matches/)).toBeOnTheScreen()
})
