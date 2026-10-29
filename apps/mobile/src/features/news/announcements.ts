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

/** Where a page's button leads, named for analytics. */
export type AnnouncementCta = 'edit_profile' | 'personalisation' | 'groups'

/** One page of an announcement, swiped through in order. */
export type AnnouncementPage = {
  /** `news:<key>` holds its title and body, and names its picture. */
  key: 'workouts' | 'feedAutoShare' | 'photoNote' | 'groupsBoard' | 'groupsChat'
  /** Only where there is a switch or a screen worth going to; most pages need none. */
  cta?: AnnouncementCta
}

export type Announcement = {
  /**
   * Stored in `profiles.seen_announcements`, so it can never change or be
   * reused once shipped: a renamed id is an announcement every account sees
   * again. Lowercase letters, digits and underscores, which the server checks.
   */
  id: string
  /** `news:<key>.title` names it in the list under Me. */
  key: 'update110' | 'groupsNews'
  /** YYYY-MM-DD, for the list and for ordering. */
  releaseDate: string
  /** At least one. A release with several changes is one card of pages, not several cards. */
  pages: readonly [AnnouncementPage, ...AnnouncementPage[]]
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
  /**
   * An older announcement whose pages follow this one's for an account that
   * never saw it, which is how a switch it turns on still reaches a slow
   * updater once this one is the newest. See `withMissed`.
   */
  folds?: string
}

/** A card as one account sees it: its pages, and every announcement they claim. */
export type ShownAnnouncement = Announcement & {
  /** Each announcement the card stands for, with what that one switches on. */
  claims: { id: string; enables?: Announcement['enables'] }[]
}

export const ANNOUNCEMENTS: readonly Announcement[] = [
  {
    id: 'groups_2026_10',
    key: 'groupsNews',
    releaseDate: '2026-10-29',
    pages: [{ key: 'groupsBoard', cta: 'groups' }, { key: 'groupsChat' }],
    // Most accounts made before 1.1.0 had not opened it when this shipped, and
    // only the newest card is put up: they get its pages, and its switch, here.
    folds: 'feed_auto_share_2026_10',
  },
  {
    // Named for its first draft, the feed page alone, which reached TestFlight
    // and no store release before the other pages joined it; so it kept the id.
    id: 'feed_auto_share_2026_10',
    key: 'update110',
    releaseDate: '2026-10-16',
    pages: [
      { key: 'workouts' },
      { key: 'feedAutoShare', cta: 'edit_profile' },
      { key: 'photoNote', cta: 'personalisation' },
    ],
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

/**
 * The card for this account: the announcement, followed by the pages of the
 * older one it folds when the account never saw that one. Each is claimed on
 * its own, with its own switch, so the server turns a setting on only for an
 * account that has not seen the announcement that turns it on.
 *
 * Folds nothing while the profile is unknown: a reader who had seen the older
 * card would only be shown it again.
 */
export function withMissed(
  announcement: Announcement,
  seen: readonly string[] | undefined,
  list: readonly Announcement[] = ANNOUNCEMENTS,
): ShownAnnouncement {
  const own = { id: announcement.id, enables: announcement.enables }
  const older = announcement.folds
    ? list.find((candidate) => candidate.id === announcement.folds)
    : undefined
  if (!older || !seen || seen.includes(older.id)) return { ...announcement, claims: [own] }
  return {
    ...announcement,
    pages: [...announcement.pages, ...older.pages],
    claims: [own, { id: older.id, enables: older.enables }],
  }
}
