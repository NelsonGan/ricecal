import { Platform, Text as RNText, type TextProps as RNTextProps } from 'react-native'

import { cn } from './cn'

/**
 * The type ramp from section 02 of the design system.
 *
 * Baloo 2 (`font-display*`) carries numbers, greetings and button labels.
 * Nunito (`font-body*`) carries anything you read as a sentence. Mixing them up
 * is the fastest way to make the app stop looking like itself.
 *
 * Line heights are absolute rather than multipliers because React Native
 * interprets a unitless `lineHeight` as points, not a ratio — a silent
 * three-fold difference.
 *
 * Every Baloo 2 line height is about 1.2x its size, not the 1.0 the design
 * document specifies. A browser lets glyphs overflow their line box; React
 * Native clips them, so `lineHeight: 52` on 52px type shears the top off "1,847"
 * and the tail off a "7". The rendered result matches the design; the number
 * cannot.
 */
const variants = {
  /** Hero numerals: the calorie count on Today. */
  displayLg: 'font-display text-[52px] leading-[62px] text-heading',
  /** Section numerals: ring centre, fasting countdown. */
  display: 'font-display text-[40px] leading-[48px] text-heading',
  /** Screen titles. Baloo 2 700 — the one place the lighter weight is used. */
  title: 'font-display-bold text-[28px] leading-[34px] text-heading',
  /** Card and sheet titles. */
  subtitle: 'font-display text-[20px] leading-[26px] text-heading',
  /** In-body headings. Nunito, because it sits above prose. */
  heading: 'font-body-black text-[22px] leading-[29px] text-ink',
  /** Default prose. */
  body: 'font-body text-[17px] leading-[27px] text-body',
  /** Prose that carries weight: a food name, a row title. */
  bodyStrong: 'font-body-black text-[17px] leading-[24px] text-ink',
  /** Form labels, toggle titles. */
  label: 'font-body-black text-[15px] leading-[20px] text-ink',
  /** Secondary line under a title: "Mamak · 1 piece". */
  meta: 'font-body-bold text-[14px] leading-[19px] text-muted',
  /** Smallest readable text. Weekday initials, badge captions. */
  caption: 'font-body-black text-[13px] leading-[17px] text-muted',
  /** The all-caps section marker above a card's content. */
  overline: 'font-body-black text-[14px] leading-[18px] tracking-[1.7px] uppercase text-faint',
  /** Inline numerals inside a row — kcal counts, weights. */
  numeric: 'font-display text-[22px] leading-[28px] text-heading',
  /** Control labels. Sentence case, three words at most. */
  button: 'font-display text-[19px] leading-[26px] text-ink',
} as const

export type TextVariant = keyof typeof variants

export type TextProps = RNTextProps & {
  variant?: TextVariant
  className?: string
}

/**
 * Android reserves vertical room inside the font box for ascenders the glyph
 * may not use, which pushes the big Baloo numerals off-centre in a ring or a
 * stepper. iOS has no equivalent and ignores the prop.
 */
const androidTightening = Platform.OS === 'android' ? { includeFontPadding: false } : null

export function Text({ variant = 'body', className, style, ...rest }: TextProps) {
  return (
    <RNText
      className={cn(variants[variant], className)}
      style={[androidTightening, style]}
      {...rest}
    />
  )
}
