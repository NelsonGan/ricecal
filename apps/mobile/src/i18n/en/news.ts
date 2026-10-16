/**
 * News: the announcement card over Today and the list of them under Me.
 *
 * Each announcement is a block named after its `key` in
 * `features/news/announcements.ts`, with a title, a body and, when it has one,
 * the button's label. The body names the settings screen by its own title
 * (`profile:account.title`) and the switch by `social:autoPostFoods`, so a
 * translation uses the words that screen actually shows.
 */
export const news = {
  /** The row under Me, and the list screen's title. */
  title: 'News',
  close: 'Close',
  done: 'Got it',
  feedAutoShare: {
    title: 'Your meals now post to your feed',
    body: 'Foods you log now share to your feed automatically. You can turn this off in Edit profile.',
    cta: 'Open settings',
    /** The example post's author, who is the reader. */
    you: 'You',
    previewLabel: 'An example of a meal posted to your feed',
  },
} as const
