/**
 * PostHog project routing. No native import, so tests and the analytics seam
 * can read it.
 *
 * The project token is a public, write-only ingestion key: it ships inside every
 * binary and cannot read data back, so it is checked in like the GA4 config
 * files rather than kept in an environment variable. The project is "RiceCal"
 * (id 659954) in the RiceCal organization, US Cloud. The website reports to the
 * same project.
 */
export const POSTHOG_PROJECT_TOKEN = 'phc_oTQVxPmCyJK7aa2vqiYpXfis7uyvXfyq6haETFw7cQj7'

export const POSTHOG_HOST = 'https://us.i.posthog.com'

/**
 * Session replay sampling, decided once per launch by the app (see
 * `startReplayForLaunch`). The free tier is 2,500 mobile recordings a month,
 * separate from the website's allowance. At ~1,500 installs and ~40,000 later
 * launches a month this is roughly 600 + 1,600 recordings: a fifth of first-day
 * launches, where onboarding and the first scans happen and replays teach the
 * most, and one in twenty-five after that.
 */
export const REPLAY_FIRST_DAY_RATE = 0.2
export const REPLAY_RETURNING_RATE = 0.04
