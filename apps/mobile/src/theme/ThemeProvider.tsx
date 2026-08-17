import { vars } from 'nativewind'
import { createContext, type ReactNode, useCallback, useMemo, useState } from 'react'
import { useColorScheme as useSystemColorScheme, View } from 'react-native'

import { type ColorSchemeName, semantic } from './tokens'

/** What the user chose. `system` follows the OS and is the default. */
export type ColorSchemePreference = ColorSchemeName | 'system'

export type ThemeContextValue = {
  /** Always concrete — `system` is already resolved against the OS. */
  colorScheme: ColorSchemeName
  /** What the user chose, including `system`. A settings screen needs this. */
  preference: ColorSchemePreference
  setPreference: (preference: ColorSchemePreference) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

/** `pandanSoftLine` -> `pandan-soft-line`, matching the names in tailwind.config.js. */
const kebab = (role: string) => role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** `#2FBF71` -> `47 191 113`, the form `rgb(var(--x) / <alpha-value>)` expects. */
function channels(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

function cssVariables(scheme: ColorSchemeName) {
  return vars(
    Object.fromEntries(
      Object.entries(semantic[scheme]).map(([role, hex]) => [
        `--color-${kebab(role)}`,
        channels(hex),
      ]),
    ),
  )
}

export type ThemeProviderProps = {
  children: ReactNode
  /** Initial preference. Persist the user's choice and pass it back in here. */
  initialPreference?: ColorSchemePreference
  /**
   * The other half of that instruction: fired whenever the choice changes, so
   * the caller has somewhere to write it.
   *
   * Without it there was no way to hold up the contract above — the setter is
   * reached through the context by whichever screen offers the control, and the
   * root layout that supplies `initialPreference` never sees it being called.
   * So the preference was read from a store nothing wrote to.
   */
  onPreferenceChange?: (preference: ColorSchemePreference) => void
}

/**
 * Owns the colour scheme and publishes the matching palette as CSS variables,
 * so every `bg-surface` and `text-muted` in the app resolves to the right mode.
 *
 * Two decisions worth knowing about, both learned the hard way:
 *
 * A `.dark:root { --color-…: … }` block in global.css does nothing. NativeWind
 * reads a stylesheet's `:root` variables once and has no dark-scoped root, so
 * the dark values compiled and were then never referenced. `vars()` is the
 * supported mechanism: it binds variables to a React subtree, which also means
 * the scope reaches into Modals — what Sheet and Select depend on.
 *
 * The scheme comes from React Native's `useColorScheme` — the `Appearance` API
 * — rather than NativeWind's store, so the one source of truth is the platform's
 * own. A user override is layered on top here instead of in a second store that
 * could disagree with it.
 *
 * Following the OS also needs `userInterfaceStyle: "automatic"` in app.json.
 * Set to `"light"`, Expo writes `UIUserInterfaceStyle: Light` into Info.plist
 * and iOS pins the whole app, so `Appearance` reports light on a device in dark
 * mode and no amount of JS will notice.
 */
export function ThemeProvider({
  children,
  initialPreference = 'system',
  onPreferenceChange,
}: ThemeProviderProps) {
  const system = useSystemColorScheme()
  const [preference, setPreference] = useState<ColorSchemePreference>(initialPreference)

  const colorScheme: ColorSchemeName =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference

  const variables = useMemo(() => cssVariables(colorScheme), [colorScheme])

  const update = useCallback(
    (next: ColorSchemePreference) => {
      setPreference(next)
      onPreferenceChange?.(next)
    },
    [onPreferenceChange],
  )

  const value = useMemo<ThemeContextValue>(
    () => ({ colorScheme, preference, setPreference: update }),
    [colorScheme, preference, update],
  )

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, variables]}>{children}</View>
    </ThemeContext.Provider>
  )
}
