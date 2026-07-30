import { render as rntlRender, screen, userEvent } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { IconPicker } from '../IconPicker'

/**
 * The picker exists because the catalogue cannot be illustrated, so the two
 * behaviours worth pinning are the ones that make it usable at that scale:
 * searching by dish name, and being able to choose nothing at all.
 *
 * "Nothing" is a distinct answer from "unchanged". The screen sends `null` to
 * clear an override and hands the row back to whatever the food carries; sending
 * `undefined` would leave the old picture in place.
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

/** `null`, not `undefined`: one clears the override, the other changes nothing. */
it('clears with null when there is something to clear', async () => {
  await open({ set: 'dishes', name: 'nasi-lemak' })
  await user.press(screen.getByText('Use no picture'))

  expect(onSelect).toHaveBeenCalledWith(null)
})

it('offers nothing to clear when nothing is set', async () => {
  await open()
  expect(screen.queryByText('Use no picture')).toBeNull()
})

it('says so when the search matches nothing', async () => {
  await open()
  await user.type(screen.getByLabelText('Search pictures'), 'pizza crust')
  expect(screen.getByText(/Nothing matches/)).toBeOnTheScreen()
})
