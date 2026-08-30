import { createContext, type ReactNode, useContext } from 'react'

/**
 * Which writing system the interface is set in, as far as type is concerned. Not
 * a language and not a locale: three dozen languages share these three answers,
 * and all the design system needs is how much vertical room a line takes.
 *
 * - `latin` is the ramp as designed, which Baloo 2 and Nunito were measured
 *   against.
 * - `cjk` is Chinese, Japanese and Korean, whose glyphs fill the em box in both
 *   directions where a Latin lowercase uses about two thirds.
 * - `tall` is Thai, Devanagari, Tamil and Bengali, which stack marks above and
 *   below the base letter.
 *
 * This is a metric rather than a word, the same kind of thing as a colour scheme.
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
