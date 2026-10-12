import { track } from './client'

/**
 * Installs and active days, the two facts no user decision announces.
 *
 * Mixpanel's SDK recorded them itself (`$ae_first_open`, `$ae_session`).
 * PostHog's equivalent, its lifecycle events, would send an "Application
 * Opened" and an "Application Backgrounded" for every trip to the home screen,
 * and would announce "Application Installed" for every existing user on the
 * first launch of the build that added it. So the app sends two events of its
 * own instead: `First App Open` once per install, and `Daily App Open` once per
 * local calendar day. Daily active users, stickiness and "came back" retention
 * read off the second; a launch where nobody logs anything still counts.
 *
 * The state lives on the handset (MMKV, injected so this stays testable) and is
 * deliberately not per account: an install is a handset fact, and two people
 * sharing a phone still make one app open a day.
 */

export type EngagementState = {
  /** The local day (YYYY-MM-DD) of the last `Daily App Open`. */
  lastDay: string | null
  /** How many distinct local days have sent one, since tracking began. */
  activeDays: number
}

export type EngagementStorage = {
  read(): string | undefined
  write(value: string): void
}

const EMPTY: EngagementState = { lastDay: null, activeDays: 0 }

/** `YYYY-MM-DD` in the phone's own time zone, which is the day the user lives in. */
export function localDay(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Whole calendar days between two local days, ignoring daylight-saving hours. */
export function daysBetween(from: string, to: string): number {
  const utc = (day: string) => {
    const [y, m, d] = day.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

export function parseEngagement(raw: string | undefined): EngagementState {
  if (!raw) return EMPTY
  try {
    const value = JSON.parse(raw) as Partial<EngagementState>
    const lastDay =
      typeof value.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.lastDay)
        ? value.lastDay
        : null
    const activeDays =
      typeof value.activeDays === 'number' && Number.isFinite(value.activeDays)
        ? Math.max(0, Math.floor(value.activeDays))
        : 0
    return { lastDay, activeDays }
  } catch {
    return EMPTY
  }
}

/**
 * Today's claim, or null when today already sent one. Pure, so the day
 * arithmetic is tested without a clock.
 */
export function claimDailyOpen(
  state: EngagementState,
  today: string,
): {
  next: EngagementState
  properties: { active_days: number; days_since_last_open: number | null }
} | null {
  if (state.lastDay === today) return null
  const activeDays = state.activeDays + 1
  return {
    next: { lastDay: today, activeDays },
    properties: {
      active_days: activeDays,
      days_since_last_open: state.lastDay ? daysBetween(state.lastDay, today) : null,
    },
  }
}

/**
 * Send `First App Open` when this is a fresh install, then today's
 * `Daily App Open` if it has not gone yet. Call at launch and on every return
 * to the foreground; all but the first call of a day are one storage read.
 *
 * `freshInstall` is decided by the caller at process start, before anything is
 * written to disk (see `startup.ts`), because only then does "nothing stored
 * yet" mean "never launched before".
 */
export function recordAppOpen(
  storage: EngagementStorage,
  { freshInstall, now = new Date() }: { freshInstall: boolean; now?: Date },
): { firstOpen: boolean; daily: boolean } {
  const state = parseEngagement(storage.read())
  const firstOpen = freshInstall && state.lastDay === null
  if (firstOpen) track('First App Open', {})

  const claim = claimDailyOpen(state, localDay(now))
  if (!claim) return { firstOpen, daily: false }
  storage.write(JSON.stringify(claim.next))
  track('Daily App Open', claim.properties)
  return { firstOpen, daily: true }
}
