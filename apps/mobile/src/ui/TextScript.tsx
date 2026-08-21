import { createContext, type ReactNode, useContext } from 'react'

/**
 * Which writing system the interface is currently set in, as far as TYPE is
 * concerned.
 *
 * Not a language and not a locale: three dozen languages share these three
 * answers, and the only thing the design system needs from any of them is how
 * much vertical room a line of it takes. See `Text` for what it does with it.
 *
 * - `latin` is the ramp as designed. Baloo 2 and Nunito were measured against
 *   it and every leading in `Text` is the number that came out of that.
 * - `cjk` is Chinese, Japanese and Korean, whose glyphs fill the em box in both
 *   directions where a Latin lowercase uses about two thirds of it.
 * - `tall` is Thai, Devanagari, Tamil and Bengali, which stack marks above and
 *   below the base letter and need more room again.
 *
 * The design system takes no words, and this is not one: it is a metric, the
 * same kind of thing as a colour scheme. The app tells it which script it is
 * rendering, the same way it tells `ThemeProvider` which palette to paint.
 */
export type TextScript = 'latin' | 'cjk' | 'tall'

const TextScriptContext = createContext<TextScript>('latin')

export type TextScriptProviderProps = {
  script: TextScript
  children: ReactNode
}

export function TextScriptProvider({ script, children }: TextScriptProviderProps) {
  return <TextScriptContext.Provider value={script}>{children}</TextScriptContext.Provider>
}

/**
 * Defaults to `latin` with no provider rather than throwing, unlike `useTheme`.
 * A missing palette paints the wrong colours and has to be loud; a missing
 * script metric renders the ramp exactly as it was designed, which is the right
 * answer for every screen in the language it was designed in.
 */
export function useTextScript(): TextScript {
  return useContext(TextScriptContext)
}
