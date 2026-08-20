import Constants from 'expo-constants'

/**
 * The URL scheme this build registered, and why it is not a constant.
 *
 * The development build is a SEPARATE APP with its own bundle id, package and
 * scheme (`ricecal-dev`), because a dev client and the TestFlight build cannot
 * coexist on one phone otherwise — see the long note in `app.config.ts`. Two
 * apps registering `ricecal://` on one device is undefined behaviour on both
 * platforms: the OS picks one, and a login link mailed to a dev build can open
 * the store build instead.
 *
 * So anything that mints a link back into this app reads it off the resolved
 * config. Two things do: the redirects Supabase mails out (`data/auth.ts`), and
 * the deep links the home screen widgets carry (`features/widgets`).
 *
 * In `lib` rather than beside either of them, because it is a fact about the
 * build rather than about signing in or about widgets.
 */
export function appScheme(): string {
  const declared = Constants.expoConfig?.scheme
  return (Array.isArray(declared) ? declared[0] : declared) ?? 'ricecal'
}
