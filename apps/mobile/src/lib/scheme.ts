import Constants from 'expo-constants'

/**
 * The URL scheme this build registered, and why it is not a constant. The
 * development build is a separate app with its own scheme (`ricecal-dev`), and
 * two apps registering `ricecal://` on one device is undefined behaviour on both
 * platforms. See `app.config.ts`.
 *
 * So anything that mints a link back into this app reads it off the resolved
 * config: the redirects Supabase mails out, and the deep links the widgets carry.
 *
 * In `lib` rather than beside either, because it is a fact about the build.
 */
export function appScheme(): string {
  const declared = Constants.expoConfig?.scheme
  return (Array.isArray(declared) ? declared[0] : declared) ?? 'ricecal'
}
