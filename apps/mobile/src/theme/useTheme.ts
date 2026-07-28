import { useContext, useMemo } from 'react'

import { type ColorSchemePreference, ThemeContext } from './ThemeProvider'
import { type ColorSchemeName, semantic, type ThemeColors } from './tokens'

export type { ColorSchemeName, ColorSchemePreference, ThemeColors }

/**
 * The active colour scheme, its palette, and the setter.
 *
 * Throws without a provider rather than falling back to light. A silent
 * fallback would render a plausible-looking light screen inside a dark app and
 * take far longer to notice than an error at startup.
 */
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>')

  const { colorScheme, preference, setPreference } = context

  return useMemo(
    () => ({
      colorScheme,
      preference,
      setPreference,
      isDark: colorScheme === 'dark',
      colors: semantic[colorScheme] as ThemeColors,
    }),
    [colorScheme, preference, setPreference],
  )
}

/**
 * Just the colours, for imperative surfaces that cannot take a className:
 * Skia canvases, victory-native charts, StatusBar, native header tints.
 *
 * Prefer a Tailwind class wherever one will reach — those follow the theme
 * through CSS variables and re-render for free.
 */
export function useThemeColors(): ThemeColors {
  return useTheme().colors
}
