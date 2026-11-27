import { useKeepAwake } from 'expo-keep-awake'

/**
 * Keeps the screen on while the calling component is mounted.
 *
 * A wrapper so every screen asks the same thing of the library: leaving the
 * screen after Android has destroyed the activity makes the native release
 * reject ("The current activity is no longer available"), and the bare hook
 * leaves that rejection uncaught. There is nothing left to keep awake by then.
 */
export function useScreenAwake(tag: string) {
  useKeepAwake(tag, { suppressDeactivateWarnings: true })
}
