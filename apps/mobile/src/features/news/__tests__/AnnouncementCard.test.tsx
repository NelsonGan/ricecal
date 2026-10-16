import type { ComponentProps } from 'react'
import { Platform } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { track } from '@/lib/analytics'
import { fireEvent, render as renderWithTheme, screen } from '@/test-utils'
import { AnnouncementCard as Card } from '../AnnouncementCard'
import { ANNOUNCEMENTS } from '../announcements'

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

function AnnouncementCard(props: ComponentProps<typeof Card>) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <Card {...props} />
    </SafeAreaProvider>
  )
}
const render = renderWithTheme

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('../FeedAutoSharePreview', () => ({ FeedAutoSharePreview: () => null }))

const feed = ANNOUNCEMENTS[0]

beforeEach(() => jest.clearAllMocks())

it('counts the card once when it appears', async () => {
  await render(<AnnouncementCard announcement={feed} source="launch" onClose={jest.fn()} />)
  expect(track).toHaveBeenCalledTimes(1)
  expect(track).toHaveBeenCalledWith('Announcement Shown', {
    announcement: feed.id,
    source: 'launch',
  })
})

it('counts the button, closes, and opens Edit profile', async () => {
  const onClose = jest.fn()
  const view = await render(
    <AnnouncementCard announcement={feed} source="settings" onClose={onClose} />,
  )
  await fireEvent.press(screen.getByText('news:feedAutoShare.cta'))
  expect(track).toHaveBeenCalledWith('Announcement CTA Tapped', {
    announcement: feed.id,
    source: 'settings',
    cta: 'open_settings',
  })
  expect(onClose).toHaveBeenCalled()
  // Pushed once the modal has gone, not while it is leaving.
  expect(mockPush).not.toHaveBeenCalled()
  // Android has no modal `onDismiss`: the route goes once the card is hidden.
  const originalPlatform = Platform.OS
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })
  try {
    await view.rerender(
      <AnnouncementCard announcement={null} source="settings" onClose={onClose} />,
    )
    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/settings/account')
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform })
  }
})

it('counts "Got it" as a dismissal', async () => {
  await render(<AnnouncementCard announcement={feed} source="launch" onClose={jest.fn()} />)
  await fireEvent.press(screen.getByText('news:done'))
  expect(track).toHaveBeenCalledWith('Announcement Dismissed', {
    announcement: feed.id,
    source: 'launch',
    via: 'done',
  })
})

it('counts one answer per showing, however fast the taps', async () => {
  const onClose = jest.fn()
  await render(<AnnouncementCard announcement={feed} source="launch" onClose={onClose} />)
  await fireEvent.press(screen.getByText('news:feedAutoShare.cta'))
  await fireEvent.press(screen.getByText('news:done'))
  expect(track).toHaveBeenCalledTimes(2)
  expect(track).toHaveBeenLastCalledWith('Announcement CTA Tapped', expect.anything())
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('counts the cross as a close', async () => {
  await render(<AnnouncementCard announcement={feed} source="launch" onClose={jest.fn()} />)
  await fireEvent.press(screen.getAllByLabelText('news:close')[0])
  expect(track).toHaveBeenCalledWith('Announcement Dismissed', {
    announcement: feed.id,
    source: 'launch',
    via: 'close',
  })
})
