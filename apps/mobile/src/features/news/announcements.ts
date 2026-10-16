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

/** Where an announcement's button leads. */
export type AnnouncementCta = 'open_settings'

export type Announcement = {
  /**
   * Stored in `profiles.seen_announcements`, so it can never change or be
   * reused once shipped: a renamed id is an announcement every account sees
   * again.
   */
  id: string
  /** `news:<key>` holds its title, body and button. */
  key: 'feedAutoShare'
  /** YYYY-MM-DD, for the list and for ordering. */
  releaseDate: string
  cta?: AnnouncementCta
  /**
   * Switched on in the same write that marks the card seen, and only when the
   * app puts the card up itself. Opening it again from the list changes
   * nothing, or reading old news would undo somebody's choice.
   */
  enables?: { autoPostFoods: true }
}

export const ANNOUNCEMENTS: readonly Announcement[] = [
  {
    id: 'feed_auto_share_2026_10',
    key: 'feedAutoShare',
    releaseDate: '2026-10-16',
    cta: 'open_settings',
    enables: { autoPostFoods: true },
  },
]

export function announcementsNewestFirst(
  list: readonly Announcement[] = ANNOUNCEMENTS,
): Announcement[] {
  return [...list].sort(
    (a, b) => b.releaseDate.localeCompare(a.releaseDate) || b.id.localeCompare(a.id),
  )
}

/**
 * The card to put up at launch, if any.
 *
 * Only ever the newest. Somebody who missed three releases sees one card, not
 * three in a row; the older ones wait in the list under Me. Once the newest is
 * seen, nothing older comes back on its own either.
 */
export function announcementToShow(
  seen: readonly string[] | null | undefined,
  list: readonly Announcement[] = ANNOUNCEMENTS,
): Announcement | null {
  const newest = announcementsNewestFirst(list)[0]
  if (!newest) return null
  return seen?.includes(newest.id) ? null : newest
}

/**
 * Every id this build knows, for a new account to start with.
 *
 * Onboarding writes it so somebody who has just joined is not told about
 * changes to an app they have never used. An account made by an older build
 * has none of them, and meets the newest card the first time it opens one
 * that knows about it.
 */
export function allAnnouncementIds(list: readonly Announcement[] = ANNOUNCEMENTS): string[] {
  return list.map((announcement) => announcement.id)
}

export function announcementById(id: string): Announcement | null {
  return ANNOUNCEMENTS.find((announcement) => announcement.id === id) ?? null
}
