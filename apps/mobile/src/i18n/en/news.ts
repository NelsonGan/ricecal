/**
 * News: the announcement card over Today and the list of them under Me.
 *
 * An announcement is pages, each a block named after its `key` in
 * `features/news/announcements.ts`, with a title and a body. The announcement
 * itself has a block too, holding only the title the list shows. A page's
 * button label is the destination's own name (`AnnouncementCard`), and a body
 * that names a screen uses that screen's title in the same language, so the
 * words match what the reader finds there.
 */
export const news = {
  /** The row under Me, and the list screen's title. */
  title: 'News',
  done: 'Got it',
  /** To the next page of a card. */
  next: 'Next',
  /** The dots under a card's pages, read by VoiceOver and TalkBack. */
  pageOf: 'Page {{page}} of {{count}}',
  update110: {
    /** Its row in the News list. Each page has its own title. */
    title: 'Workouts, feed posts and a new camera',
  },
  workouts: {
    title: 'Log your workouts',
    body: 'Track sets, reps and rest in the new Workouts tab.',
    /** iOS only: the Apple Watch app is not on Android, so its body leaves it out. */
    bodyIos:
      'Track sets, reps and rest in the new Workouts tab, and your heart rate on Apple Watch.',
    previewLabel: 'An example of a workout being logged',
  },
  feedAutoShare: {
    title: 'Your meals now post to your feed',
    /** Workouts follow meals onto the feed, so the card says so. */
    body: 'Finished workouts post too. Turn either off in Edit profile.',
    /** The example post's author, who is the reader. */
    you: 'You',
    previewLabel: 'An example of a meal posted to your feed',
  },
  photoNote: {
    title: 'The camera is now full size',
    /** Names the Personalisation screen, where the switch is. */
    body: 'After a photo, it asks for a few details for a better estimate. Turn that off in Personalisation.',
    previewLabel: 'An example of the question after a meal photo',
  },
} as const
