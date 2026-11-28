import { createJsonStore } from '@/lib/jsonStore'

/**
 * What the summary card on Today shows: the stats, or the avatar.
 *
 * Per phone and per account, like the other glance preferences: it is how this
 * person likes to read this screen, not a fact about their account, and two
 * people sharing a phone each keep their own. Stats until somebody chooses
 * the avatar, so nobody updates the app to find their numbers gone.
 */
export type SummaryView = 'stats' | 'avatar'

const store = createJsonStore<{ view: SummaryView }>(
  'ricecal-avatar',
  (stored) => ({
    view: (stored as { view?: unknown } | undefined)?.view === 'avatar' ? 'avatar' : 'stats',
  }),
  { bestEffort: true },
)

export function setSummaryView(userId: string, view: SummaryView): void {
  store.set(userId, { view })
}

export function useSummaryView(userId: string): SummaryView {
  return store.useValue(userId, (value) => value.view)
}
