import Constants from 'expo-constants'

/**
 * The URL scheme this build registered, read off the resolved config so the
 * scheme lives in one place (`app.json`). Anything that mints a link back into
 * this app uses it: the redirects Supabase mails out, and the deep links the
 * widgets carry.
 *
 * In `lib` rather than beside either, because it is a fact about the build.
 */
export function appScheme(): string {
  const declared = Constants.expoConfig?.scheme
  return (Array.isArray(declared) ? declared[0] : declared) ?? 'ricecal'
}
