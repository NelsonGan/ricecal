/**
 * News: the announcement card over Today and the list of them under Me.
 *
 * Each announcement is a block named after its `key` in
 * `features/news/announcements.ts`, with a title and a body. The button's
 * label is the destination's own name (`AnnouncementCard`), and a body that
 * names a screen uses that screen's title in the same language, so the words
 * match what the reader finds there.
 */
export const news = {
  /** The row under Me, and the list screen's title. */
  title: 'News',
  done: 'Got it',
  feedAutoShare: {
    title: 'Your meals now post to your feed',
    /** Workouts follow meals onto the feed, so the card says so. */
    body: 'Finished workouts post too. Turn either off in Edit profile.',
    /** The example post's author, who is the reader. */
    you: 'You',
    previewLabel: 'An example of a meal posted to your feed',
  },
} as const
