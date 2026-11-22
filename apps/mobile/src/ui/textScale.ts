import { useWindowDimensions } from 'react-native'

/**
 * Whether text follows the phone's text size setting. Off: every screen is
 * drawn at the sizes it was designed at, whatever the setting says.
 *
 * The app's layouts are tight (two columns on Today, a ring with its figure in
 * the hole, fixed-width date cells), and each one scaled differently: some
 * capped their text, some swapped to a stacked layout past 130%, some did
 * neither and clipped. The result was a different app at every setting. With
 * scaling off there is one app, and it is the one in the designs.
 *
 * This is the one switch. `Text` and every `TextInput` pass it as
 * `allowFontScaling`, and `useFontScale` reads 1 while it is off, so the
 * layouts that used to react to large text keep their default shape instead
 * of stacking for text that no longer grows.
 */
export const TEXT_SCALES = false

/**
 * The text scale the layout should plan for: the system's while text scales,
 * and 1 while it does not. Read this rather than `useWindowDimensions().fontScale`,
 * which reports the setting even when no text follows it.
 */
export function useFontScale(): number {
  const { fontScale } = useWindowDimensions()
  return TEXT_SCALES ? fontScale : 1
}
