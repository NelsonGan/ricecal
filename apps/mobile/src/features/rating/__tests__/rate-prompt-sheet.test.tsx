import type { ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import type { RatingRequest } from '@/lib/rating'
import { act, render, screen, userEvent } from '@/test-utils'
import { ToastProvider } from '@/ui'
import { RatePromptSheet } from '../RatePromptSheet'

/**
 * The two screens behind "Enjoying RiceCal?".
 *
 * The branch worth pinning is the unhappy one, and it is worth pinning because
 * getting it wrong is invisible: a sheet that closed on "Not really" would look
 * perfectly reasonable on a device, and would silently throw away every piece of
 * feedback the whole design exists to collect. The other half of the same
 * contract is that the browser is never opened without a second, explicit tap.
 */

const mockLiked = jest.fn()
const mockDisliked = jest.fn()
const mockDismissed = jest.fn()
const mockFeedbackOpened = jest.fn()
const mockOpenURL = jest.fn((_url: string) => Promise.resolve(true))
let publish: ((request: RatingRequest) => void) | null = null

jest.mock('@/lib/rating', () => ({
  ratingLiked: (request: unknown) => mockLiked(request),
  ratingDisliked: (request: unknown) => mockDisliked(request),
  ratingDismissed: (request: unknown) => mockDismissed(request),
  ratingFeedbackOpened: (request: unknown) => mockFeedbackOpened(request),
  subscribeToRatingPrompt: (listener: (request: RatingRequest) => void) => {
    publish = listener
    return () => {
      publish = null
    }
  },
}))

jest.mock('expo-linking', () => ({ openURL: (url: string) => mockOpenURL(url) }))

const user = userEvent.setup()

const REQUEST: RatingRequest = { trigger: 'meal_milestone', userId: 'user-1' }

/** A phone, so the sheet can inset itself off the home indicator. */
const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

function Host({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ToastProvider>{children}</ToastProvider>
    </SafeAreaProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

async function open() {
  await render(
    <Host>
      <RatePromptSheet />
    </Host>,
  )
  // Nothing on screen until something asks for it. The sheet is mounted for the
  // whole life of the app and must be invisible for almost all of it.
  expect(screen.queryByText('Enjoying RiceCal?')).toBeNull()
  // Through an ASYNC `act`, because the bridge is a plain callback rather than a
  // React event and nothing else would flush the state it sets. The synchronous
  // form is not enough: the sheet's rise is a Reanimated timing, so the panel is
  // not on screen until the frames after the state change have run.
  await act(async () => {
    publish?.(REQUEST)
  })
  expect(await screen.findByText('Enjoying RiceCal?')).toBeTruthy()
}

it('sends a yes on to the store, naming the trigger it rode in on', async () => {
  await open()
  await user.press(screen.getByText('I like it'))
  expect(mockLiked).toHaveBeenCalledWith(REQUEST)
  expect(mockOpenURL).not.toHaveBeenCalled()
})

it('turns a no into the offer of a conversation rather than closing', async () => {
  await open()
  await user.press(screen.getByText('Not really'))

  expect(mockDisliked).toHaveBeenCalledWith(REQUEST)
  // The sheet is still up, showing the second screen.
  expect(await screen.findByText('What would fix it?')).toBeTruthy()
  // And nothing has been opened on their behalf.
  expect(mockOpenURL).not.toHaveBeenCalled()

  await user.press(screen.getByText('Open Discord'))
  expect(mockFeedbackOpened).toHaveBeenCalledWith(REQUEST)
  expect(mockOpenURL).toHaveBeenCalledWith(expect.stringContaining('discord'))
})

it('counts backing out of the second screen as nothing further', async () => {
  await open()
  await user.press(screen.getByText('Not really'))
  await user.press(await screen.findByText('Not now'))

  // The answer was already reported and the cooldown already stamped, so
  // declining the conversation reports nothing of its own. See the note in
  // `events.ts` about why there is no `Rating Feedback Declined`.
  expect(mockFeedbackOpened).not.toHaveBeenCalled()
  expect(mockDismissed).not.toHaveBeenCalled()
})

it('treats "maybe later" as an answer', async () => {
  await open()
  await user.press(screen.getByText('Maybe later'))
  expect(mockDismissed).toHaveBeenCalledWith(REQUEST)
})
