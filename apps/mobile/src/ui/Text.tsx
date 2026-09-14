import {
  PixelRatio,
  Platform,
  Text as RNText,
  type TextProps as RNTextProps,
  StyleSheet,
} from 'react-native'

import { cn } from './cn'
import { useTextScript } from './TextScript'

/**
 * The type ramp from section 02 of the design system. Baloo 2 (`font-display*`)
 * carries numbers, greetings and button labels; Nunito (`font-body*`) carries
 * anything read as a sentence.
 *
 * Size and leading are data as well as classes, because the leading is recomputed
 * at runtime from the reader's Dynamic Type setting and the script being
 * rendered. See `resolveLineHeight`.
 *
 * Baloo 2 has a deeper native line box than Nunito. React Native clips that box
 * when a caller asks for tighter leading, so `resolveLineHeight` also applies a
 * floor for the font face rather than relying on each variant to remember it.
 */
const variants = {
  /** Hero numerals: the calorie count on Today. */
  displayLg: { size: 52, leading: 62, className: 'font-display text-[52px] text-heading' },
  /** Section numerals: ring centre, current weight. */
  display: { size: 40, leading: 48, className: 'font-display text-[40px] text-heading' },
  /** A hero number inside a card: the day's total, the week's average. */
  displayMd: { size: 32, leading: 39, className: 'font-display text-[32px] text-heading' },
  /** Screen titles. Baloo 2 700 — the one place the lighter weight is used. */
  title: { size: 28, leading: 34, className: 'font-display-bold text-[28px] text-heading' },
  /** The title of a root screen, and the headline over a hero illustration. */
  screenTitle: { size: 26, leading: 32, className: 'font-display text-[26px] text-heading' },
  /** Card and sheet titles. */
  subtitle: { size: 20, leading: 26, className: 'font-display text-[20px] text-heading' },
  /** In-body headings. Nunito, because it sits above prose. */
  heading: { size: 22, leading: 29, className: 'font-body-black text-[22px] text-ink' },
  /** Default prose. */
  body: { size: 17, leading: 27, className: 'font-body text-[17px] text-body' },
  /** Prose that carries weight: a food name, a row title. */
  bodyStrong: { size: 17, leading: 24, className: 'font-body-black text-[17px] text-ink' },
  /** Form labels, toggle titles. */
  label: { size: 15, leading: 20, className: 'font-body-black text-[15px] text-ink' },
  /** Secondary line under a title: "Mamak · 1 piece". */
  meta: { size: 14, leading: 19, className: 'font-body-bold text-[14px] text-muted' },
  /** Smallest readable text. Weekday initials, badge captions. */
  caption: { size: 13, leading: 17, className: 'font-body-black text-[13px] text-muted' },
  /** The all-caps section marker above a card's content. */
  overline: {
    size: 14,
    leading: 18,
    className: 'font-body-black text-[14px] tracking-[1.7px] uppercase text-faint',
  },
  /**
   * The same marker where three sit side by side — a stat row, a tile. The
   * wider tracking of `overline` wraps "PROTEIN" at that width.
   */
  overlineSm: {
    size: 12,
    leading: 15,
    className: 'font-body-black text-[12px] tracking-[1.1px] uppercase text-faint',
  },
  /** Axis labels, chip counts, the smallest type in the system. */
  micro: { size: 11, leading: 14, className: 'font-body-black text-[11px] text-faint' },
  /** Inline numerals inside a row — kcal counts, weights. */
  numeric: { size: 22, leading: 28, className: 'font-display text-[22px] text-heading' },
  /** Control labels. Sentence case, three words at most. */
  button: { size: 19, leading: 26, className: 'font-display text-[19px] text-ink' },
} as const

export type TextVariant = keyof typeof variants

/**
 * The least leading a script can be set in, as a multiple of the type size.
 *
 * A Latin lowercase uses about two thirds of the em box, which is why 1.2x
 * looks generous in English and shears the tops off 没有上限. CJK glyphs fill
 * the box in both directions; Thai, Devanagari, Tamil and Bengali stack marks
 * above and below the base letter and need more again.
 *
 * A FLOOR rather than a replacement. Script floors leave roomy prose alone and
 * only open a line when its glyphs need it.
 */
const scriptLeading = { latin: 1, cjk: 1.36, tall: 1.5 } as const

/**
 * Baloo 2 clips on iOS below 1.36x, even in Latin. The font's native ascent and
 * descent are much deeper than Nunito's, and the clipped bottoms are easiest to
 * see on rounded lowercase letters such as those in "A few basics".
 */
const displayLeading = 1.36

/**
 * A caller's own size and leading, read back off the class string.
 *
 * Callers size type against measured elements such as rings, steppers and share
 * cards. Their pairs are parsed so safe leading is preserved and only a pair
 * below the font or script floor is opened up. The same Dynamic Type scaling is
 * then applied to the result as to a variant.
 *
 * Cached because it runs on every `Text` in the tree and the class strings are
 * a small fixed set.
 */
const overrides = new Map<string, { size?: number; leading?: number }>()

function classMetrics(className: string): { size?: number; leading?: number } {
  const hit = overrides.get(className)
  if (hit) return hit

  const size = className.match(/text-\[(\d+(?:\.\d+)?)px\]/)
  const leading = className.match(/leading-\[(\d+(?:\.\d+)?)px\]/)
  const parsed = {
    size: size ? Number(size[1]) : undefined,
    leading: leading ? Number(leading[1]) : undefined,
  }
  overrides.set(className, parsed)
  return parsed
}

/**
 * Dynamic Type scales the font size and leaves an absolute `lineHeight` where
 * it was, so the ratio between them collapses as the reader turns text up: at
 * XXXL the 1.19x on `displayMd` is nearer 0.9x and the line box crops the
 * glyphs rather than the other way round. English survives it because Baloo 2's
 * caps are short. 没有上限 does not.
 *
 * Multiplying by the same scale the platform applied to the size restores the
 * ratio at every setting, for every script.
 */
function resolveLineHeight(
  variant: TextVariant,
  className: string,
  script: keyof typeof scriptLeading,
  style: RNTextProps['style'],
): number {
  const custom = classMetrics(className)
  const inline = StyleSheet.flatten(style)
  const size = inline?.fontSize ?? custom.size ?? variants[variant].size
  const leading = inline?.lineHeight ?? custom.leading ?? variants[variant].leading
  const fontLeading = className.includes('font-display') ? displayLeading : 1
  const minimumLeading = Math.max(scriptLeading[script], fontLeading)
  return Math.round(Math.max(leading, size * minimumLeading) * PixelRatio.getFontScale())
}

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

export function Text({
  variant = 'body',
  className,
  style,
  adjustsFontSizeToFit,
  ...rest
}: TextProps) {
  const script = useTextScript()
  const resolvedClassName = cn(variants[variant].className, className)

  /**
   * NOTHING for a shrinking label, and that is load-bearing.
   * `adjustsFontSizeToFit` beside an explicit `lineHeight` is a long-standing
   * React Native bug: it shrinks the text even when there is room. `StatTile`
   * documents the symptom, and its test pins this.
   */
  const leading = adjustsFontSizeToFit
    ? null
    : { lineHeight: resolveLineHeight(variant, resolvedClassName, script, style) }

  return (
    <RNText
      className={resolvedClassName}
      // Leading comes after `style` so an inline size participates in the same
      // floor and an inline line height cannot silently bypass it.
      style={[androidTightening, style, leading]}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      {...rest}
    />
  )
}
