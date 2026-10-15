import '@/i18n'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { fireEvent, render, screen, userEvent } from '@/test-utils'
import { PhotoNotePanel } from '../PhotoNotePanel'

/**
 * The step after the shutter. What is pinned is the contract with the log sheet,
 * which starts a scan on the strength of it: Skip sends no words whatever was
 * typed, Log sends them trimmed, and an empty Log is the photo alone rather than
 * a dead button.
 */

const onLog = jest.fn()
const onSkip = jest.fn()
const onRetake = jest.fn()
const user = userEvent.setup()
const PLACEHOLDER = 'Beef not chicken, teh o kosong, shared'

beforeEach(() => {
  onLog.mockClear()
  onSkip.mockClear()
  onRetake.mockClear()
})

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

const renderPanel = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <PhotoNotePanel
        photoUri="file:///plate.jpg"
        onLog={onLog}
        onSkip={onSkip}
        onRetake={onRetake}
      />
    </SafeAreaProvider>,
  )

it('opens with the keyboard up', async () => {
  await renderPanel()
  expect(screen.getByPlaceholderText(PLACEHOLDER).props.autoFocus).toBe(true)
})

it('logs the note, trimmed', async () => {
  await renderPanel()
  await user.type(screen.getByPlaceholderText(PLACEHOLDER), '  beef rendang, not chicken  ')
  await user.press(screen.getByRole('button', { name: 'Log meal' }))
  expect(onLog).toHaveBeenCalledWith('beef rendang, not chicken')
  expect(onSkip).not.toHaveBeenCalled()
})

it('logs from the return key', async () => {
  await renderPanel()
  const field = screen.getByPlaceholderText(PLACEHOLDER)
  await user.type(field, 'teh o kosong')
  fireEvent(field, 'submitEditing')
  expect(onLog).toHaveBeenCalledWith('teh o kosong')
})

it('skips without the words, even after typing some', async () => {
  await renderPanel()
  await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'half')
  await user.press(screen.getByRole('button', { name: 'Skip' }))
  expect(onSkip).toHaveBeenCalledTimes(1)
  expect(onLog).not.toHaveBeenCalled()
})

it('treats an empty note as the photo alone', async () => {
  await renderPanel()
  await user.press(screen.getByRole('button', { name: 'Log meal' }))
  expect(onLog).toHaveBeenCalledWith('')
})

it('adds a suggestion to what is typed rather than replacing it', async () => {
  await renderPanel()
  const field = screen.getByPlaceholderText(PLACEHOLDER)
  await user.type(field, 'beef not chicken')
  await user.press(screen.getByText('Shared'))
  await user.press(screen.getByText('Less rice'))
  // Twice is once: a chip already in the note is not added again.
  await user.press(screen.getByText('Shared'))
  expect(field.props.value).toBe('beef not chicken, Shared, Less rice')
})

it('starts one scan however many times it is pressed', async () => {
  await renderPanel()
  const field = screen.getByPlaceholderText(PLACEHOLDER)
  await user.type(field, 'shared')
  fireEvent(field, 'submitEditing')
  await user.press(screen.getByRole('button', { name: 'Log meal' }))
  await user.press(screen.getByRole('button', { name: 'Skip' }))
  expect(onLog).toHaveBeenCalledTimes(1)
  expect(onSkip).not.toHaveBeenCalled()
})

it('goes back to the camera on Retake', async () => {
  await renderPanel()
  await user.press(screen.getByRole('button', { name: 'Retake' }))
  expect(onRetake).toHaveBeenCalledTimes(1)
})
