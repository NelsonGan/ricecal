// One subpath per face, never the package index: the index `require`s every
// weight it ships, and Metro bundles each one as an asset whether or not it is
// loaded. Through the index, these five faces carried 4 MB of fonts.
import { Baloo2_700Bold } from '@expo-google-fonts/baloo-2/700Bold'
import { Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2/800ExtraBold'
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular'
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold'
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold'

/**
 * The five faces the system uses. Baloo 2 carries numbers, headings and button
 * labels; Nunito carries everything you read as a sentence.
 *
 * The keys are the family names Tailwind emits (see `fontFamily` in
 * tailwind.config.js), so `font-display` in a className and `Baloo2_800ExtraBold`
 * here have to stay spelled identically.
 *
 * Loaded at runtime rather than embedded via the expo-font config plugin: the
 * plugin is more efficient but requires a native rebuild on every change, and
 * these five files are ~350KB total, hidden entirely behind the splash screen.
 * Worth revisiting if the set grows.
 */
export const fontMap = {
  Baloo2_700Bold,
  Baloo2_800ExtraBold,
  Nunito_400Regular,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} as const

export type FontFamily = keyof typeof fontMap
