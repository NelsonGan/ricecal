/**
 * The news the app announces in a card over Today, and lists under Me.
 *
 * Code rather than a table: each one has its own picture and copy, both of
 * which ship in the binary anyway, so a row in the database could only ever
 * name an announcement this build already knows how to draw.
 *
 * No native imports, so the rules below are testable under node.
 */

/** Whether a card was put up by the app at launch, or opened from the list. */
export type AnnouncementSource = 'launch' | 'settings'

/** Where an announcement's button leads, named for analytics. */
export type AnnouncementCta = 'edit_profile'

export type Announcement = {
  /**
   * Stored in `profiles.seen_announcements`, so it can never change or be
   * reused once shipped: a renamed id is an announcement every account sees
   * again. Lowercase letters, digits and underscores, which the server checks.
   */
  id: string
  /** `news:<key>` holds its title and body. */
  key: 'feedAutoShare'
  /** YYYY-MM-DD, for the list and for ordering. */
  releaseDate: string
  cta?: AnnouncementCta
  /**
   * Switched on in the same statement that marks the card seen, the first time
   * it is on screen, from the launch or the list. Never again after that, or
   * reading old news would undo a choice made since.
   *
   * Only the newest card is ever put up at launch, so a newer announcement
   * shipped while this one is still reaching people would leave slow updaters
   * without the change. Fold the message into the newer card instead.
   */
  enables?: { autoPostFoods: true }
}

export const ANNOUNCEMENTS: readonly Announcement[] = [
  {
    id: 'feed_auto_share_2026_10',
    key: 'feedAutoShare',
    releaseDate: '2026-10-16',
    cta: 'edit_profile',
    enables: { autoPostFoods: true },
  },
]

export function announcementsNewestFirst(
  list: readonly Announcement[] = ANNOUNCEMENTS,
): Announcement[] {
  return [...list].sort((a, b) =>
    a.releaseDate === b.releaseDate
      ? a.id < b.id
        ? 1
        : -1
      : a.releaseDate < b.releaseDate
        ? 1
        : -1,
  )
}

const NEWEST = announcementsNewestFirst()[0] ?? null

/**
 * The card due for this account, if any: only ever the newest. Somebody who
 * missed three releases sees one card, not three in a row; the older ones wait
 * in the list under Me, and nothing older comes back on its own.
 *
 * Nothing for a profile that is not loaded or not finished, since there is
 * nothing to put a card over yet. The launch offer and the Pro nudge both ask
 * this, so the two cannot disagree about whether a card is coming.
 */
export function announcementDue(
  profile: { onboarded_at: string | null; seen_announcements?: string[] } | null | undefined,
  newest: Announcement | null = NEWEST,
): Announcement | null {
  if (!profile?.onboarded_at || !newest) return null
  return profile.seen_announcements?.includes(newest.id) ? null : newest
}

/**
 * Every id this build knows, for a new account to start with.
 *
 * Onboarding marks them seen so somebody who has just joined is not told about
 * changes to an app they have never used. An account made by an older build
 * has none of them, and meets the newest card the first time it opens one
 * that knows about it.
 */
export function allAnnouncementIds(): string[] {
  return ANNOUNCEMENTS.map((announcement) => announcement.id)
}
