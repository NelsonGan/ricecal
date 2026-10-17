import type { ComponentProps } from 'react'
import { Platform } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { track } from '@/lib/analytics'
import { act, fireEvent, render, screen } from '@/test-utils'
import { AnnouncementCard as Card } from '../AnnouncementCard'
import { ANNOUNCEMENTS } from '../announcements'

const mockPush = jest.fn()
const mockSee = jest.fn()
const mockProfile: { seen_announcements: string[] } = { seen_announcements: [] }
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('@/lib/errors', () => ({ reportError: jest.fn() }))
jest.mock('@/data', () => ({
  useProfile: () => ({ data: mockProfile }),
  useSeeAnnouncement: () => ({ mutate: mockSee }),
}))
jest.mock('../FeedAutoSharePreview', () => ({ FeedAutoSharePreview: () => null }))
jest.mock('../WorkoutsPreview', () => ({ WorkoutsPreview: () => null }))
jest.mock('../PhotoNotePreview', () => ({ PhotoNotePreview: () => null }))

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}
const feed = ANNOUNCEMENTS[0]

function AnnouncementCard(props: ComponentProps<typeof Card>) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <Card {...props} />
    </SafeAreaProvider>
  )
}

/** The native modal reporting that it is on screen, which the test renderer never does. */
async function presented() {
  await act(async () => screen.getByTestId('announcement-card').props.onShow())
}

/** On to the page numbered from 1, by Next, as the reader would. */
async function toPage(page: number) {
  for (let at = 1; at < page; at++) await fireEvent.press(screen.getByText('news:next'))
}

function withPlatform(os: 'ios' | 'android', run: () => Promise<void>) {
  const original = Platform.OS
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os })
  return run().finally(() =>
    Object.defineProperty(Platform, 'OS', { configurable: true, value: original }),
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockProfile.seen_announcements = []
})

it('counts and marks nothing until the card is actually on screen', async () => {
  await render(<AnnouncementCard announcement={feed} source="launch" onClose={jest.fn()} />)
  expect(track).not.toHaveBeenCalled()
  expect(mockSee).not.toHaveBeenCalled()
  await presented()
  expect(track).toHaveBeenCalledWith('Announcement Shown', {
    announcement: feed.id,
    source: 'launch',
  })
  expect(mockSee).toHaveBeenCalledWith(
    { id: feed.id, enables: { autoPostFoods: true } },
    expect.anything(),
  )
})

it('marks it seen from the list too, the first time, and never again', async () => {
  await render(<AnnouncementCard announcement={feed} source="settings" onClose={jest.fn()} />)
  await presented()
  expect(mockSee).toHaveBeenCalledTimes(1)

  jest.clearAllMocks()
  mockProfile.seen_announcements = [feed.id]
  await presented()
  expect(track).toHaveBeenCalledWith('Announcement Shown', expect.anything())
  expect(mockSee).not.toHaveBeenCalled()
})

it('counts the button, closes, and opens Edit profile once the card has gone', async () => {
  const onClose = jest.fn()
  const view = await render(
    <AnnouncementCard announcement={feed} source="settings" onClose={onClose} />,
  )
  await presented()
  await toPage(2)
  await fireEvent.press(screen.getByText('social:editProfile'))
  expect(track).toHaveBeenCalledWith('Announcement CTA Tapped', {
    announcement: feed.id,
    source: 'settings',
    cta: 'edit_profile',
    page: 2,
  })
  expect(onClose).toHaveBeenCalled()
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

it('steps through the pages with Next, offering a page\'s button where it has one, and ends on "Got it"', async () => {
  await render(<AnnouncementCard announcement={feed} source="launch" onClose={jest.fn()} />)
  await presented()
  // The workouts page has no button of its own: Next and the cross only.
  expect(screen.queryByText('social:editProfile')).toBeNull()
  expect(screen.queryByText('profile:personalisation.title')).toBeNull()
  expect(screen.queryByText('news:done')).toBeNull()
  await toPage(2)
  expect(screen.getByText('social:editProfile')).toBeTruthy()
  await toPage(2)
  expect(screen.getByText('profile:personalisation.title')).toBeTruthy()
  expect(screen.queryByText('news:next')).toBeNull()
  expect(screen.getByText('news:done')).toBeTruthy()
})

it('starts every showing on the first page', async () => {
  const view = await render(
    <AnnouncementCard announcement={feed} source="settings" onClose={jest.fn()} />,
  )
  await presented()
  await toPage(3)
  await view.rerender(
    <AnnouncementCard announcement={null} source="settings" onClose={jest.fn()} />,
  )
  await view.rerender(
    <AnnouncementCard announcement={feed} source="settings" onClose={jest.fn()} />,
  )
  expect(screen.getByText('news:next')).toBeTruthy()
  expect(screen.queryByText('news:done')).toBeNull()
})

it('names the Apple Watch on iOS only', async () => {
  await withPlatform('ios', async () => {
    await render(<AnnouncementCard announcement={feed} source="launch" onClose={jest.fn()} />)
    expect(screen.getByText('news:workouts.bodyIos')).toBeTruthy()
    expect(screen.queryByText('news:workouts.body')).toBeNull()
  })
  await withPlatform('android', async () => {
    await render(<AnnouncementCard announcement={feed} source="launch" onClose={jest.fn()} />)
    expect(screen.getByText('news:workouts.body')).toBeTruthy()
    expect(screen.queryByText('news:workouts.bodyIos')).toBeNull()
  })
})

it('counts "Got it" as a dismissal on the last page', async () => {
  await render(<AnnouncementCard announcement={feed} source="launch" onClose={jest.fn()} />)
  await presented()
  await toPage(3)
  await fireEvent.press(screen.getByText('news:done'))
  expect(track).toHaveBeenCalledWith('Announcement Dismissed', {
    announcement: feed.id,
    source: 'launch',
    via: 'done',
    page: 3,
  })
})

it('counts one answer per showing, however fast the taps', async () => {
  const onClose = jest.fn()
  await render(<AnnouncementCard announcement={feed} source="launch" onClose={onClose} />)
  await presented()
  await toPage(2)
  await fireEvent.press(screen.getByText('social:editProfile'))
  await fireEvent.press(screen.getAllByLabelText('common:a11y.close')[0])
  expect(track).toHaveBeenCalledTimes(2)
  expect(track).toHaveBeenLastCalledWith('Announcement CTA Tapped', expect.anything())
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('counts the cross as a close', async () => {
  await render(<AnnouncementCard announcement={feed} source="launch" onClose={jest.fn()} />)
  await presented()
  await fireEvent.press(screen.getAllByLabelText('common:a11y.close')[0])
  expect(track).toHaveBeenCalledWith('Announcement Dismissed', {
    announcement: feed.id,
    source: 'launch',
    via: 'close',
    page: 1,
  })
})
