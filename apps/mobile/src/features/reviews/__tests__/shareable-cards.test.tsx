import { Text } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { act, render, screen, userEvent, waitFor } from '@/test-utils'
import { Shareable, ShareableCards } from '../ShareableCards'

const mockCaptureView = jest.fn()
const mockSharePicture = jest.fn((_shot: unknown, _message: string) => Promise.resolve(true))

jest.mock('@/lib/share', () => ({
  captureView: (view: unknown) => mockCaptureView(view),
  sharePicture: (shot: unknown, message: string) => mockSharePicture(shot, message),
}))

const CLEAN = { uri: 'file:///clean.png', width: 300, height: 180 }
const BRANDED = { uri: 'file:///branded.png', width: 300, height: 180 }

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

const user = userEvent.setup()

beforeEach(() => {
  jest.clearAllMocks()
  mockCaptureView.mockResolvedValueOnce(CLEAN).mockResolvedValueOnce(BRANDED)
  mockSharePicture.mockReset().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
})

it('keeps the mark in the preview and safely reuses the branded image after a cancelled share', async () => {
  const onShared = jest.fn()

  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ShareableCards message="A good week" onShared={onShared}>
        <Shareable title="Weekly summary">
          <Text>Card content</Text>
        </Shareable>
      </ShareableCards>
    </SafeAreaProvider>,
  )

  // The original card never owns the mark, so no state update can flash it
  // there while the first screenshot is taken.
  expect(screen.queryByText('RiceCal')).toBeNull()

  await user.press(screen.getByLabelText('Share Weekly summary'))

  expect(await screen.findByText('RiceCal', { includeHiddenElements: true })).toBeTruthy()
  const preview = screen.getByLabelText('The card as it will be sent')
  expect(preview).toBeTruthy()
  expect(mockCaptureView).toHaveBeenCalledTimes(1)

  await act(async () => preview.props.onLoad())
  const share = screen.getByRole('button', { name: 'Share' })
  await waitFor(() => expect(share).toBeEnabled())
  await user.press(share)

  await waitFor(() => expect(mockSharePicture).toHaveBeenCalledWith(BRANDED, 'A good week'))
  expect(mockCaptureView).toHaveBeenCalledTimes(2)
  expect(onShared).not.toHaveBeenCalled()
  // The mark now lives inside the branded image, not in a second overlay.
  expect(screen.queryByText('RiceCal', { includeHiddenElements: true })).toBeNull()

  // The clean file has been replaced on disk, so the sheet now reads the
  // branded result directly and a retry reuses it rather than recapturing a
  // preview whose source no longer exists.
  const brandedPreview = screen.getByLabelText('The card as it will be sent')
  await act(async () => brandedPreview.props.onLoad())
  const retry = screen.getByRole('button', { name: 'Share' })
  await waitFor(() => expect(retry).toBeEnabled())
  await user.press(retry)

  expect(mockCaptureView).toHaveBeenCalledTimes(2)
  await waitFor(() => expect(mockSharePicture).toHaveBeenCalledTimes(2))
  expect(mockSharePicture).toHaveBeenLastCalledWith(BRANDED, 'A good week')
  expect(onShared).toHaveBeenCalledTimes(1)
})
