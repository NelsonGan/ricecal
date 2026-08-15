import type { ReactNode } from 'react'

import { radius, slab } from '@/theme/tokens'
import { cn } from './cn'
import { Squish } from './Squish'
import { Text } from './Text'

const tones = {
  surface: { fill: 'bg-surface', slab: 'bg-line', label: 'text-heading' },
  pandan: { fill: 'bg-pandan-soft', slab: 'bg-pandan-soft-line', label: 'text-pandan-ink' },
  kaya: { fill: 'bg-kaya-soft', slab: 'bg-kaya-soft-line', label: 'text-kaya-ink' },
  hibiscus: {
    fill: 'bg-hibiscus-soft',
    slab: 'bg-hibiscus-soft-line',
    label: 'text-hibiscus-ink',
  },
  water: { fill: 'bg-water-soft', slab: 'bg-water-soft-line', label: 'text-water-ink' },
  /** Dietary fat, and only that: the macro trio is kaya, hibiscus, teh everywhere. */
  teh: { fill: 'bg-teh-soft', slab: 'bg-teh-soft-line', label: 'text-teh-ink' },
  track: { fill: 'bg-track', slab: 'bg-line-strong', label: 'text-heading' },
} as const

export type StatTileTone = keyof typeof tones

export type StatTileProps = {
  /** Caps label under the value: "PACE", "GOAL DATE". */
  label: string
  /** The number or short phrase. Rendered above the label. */
  value: string
  /** One line of context under it. */
  caption?: string
  icon?: ReactNode
  tone?: StatTileTone
  onPress?: () => void
  className?: string
}

/**
 * A small metric tile: 7-day average, pace, goal date, a quick-add shortcut.
 *
 * Sized by its container rather than fixed, so a row of three and a grid of two
 * both work without a size prop. Put `flex-1` in `className` for equal columns.
 */
export function StatTile({
  label,
  value,
  caption,
  icon,
  tone = 'surface',
  onPress,
  className,
}: StatTileProps) {
  const palette = tones[tone]

  return (
    <Squish
      depth={slab.md}
      radius={radius.tile}
      containerClassName={className}
      slabClassName={palette.slab}
      // `grow` matters when tiles sit in a row: the slab layer stretches to the
      // tallest sibling, and without this the surface keeps its content height
      // and leaves a bare strip of slab showing underneath.
      className={cn('grow gap-1.5 px-3 py-4', palette.fill)}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={caption}
    >
      {icon}
      {/* Value first, label under: the number is what the eye is looking for,
          and the label only says what it was.

          One line, shrinking if it has to. Three tiles across a phone leaves
          about 100pt each, and "1,530" broken after the comma reads as two
          numbers — worse than the same figure a point or two smaller.

          NO `leading-` here, and that is load-bearing. `adjustsFontSizeToFit`
          alongside an explicit lineHeight is a long-standing React Native bug:
          it shrinks the text even when there is room, worst when the layout hands
          it a fractional height — which is exactly what `flex-1` across a row of
          three on a 393pt screen produces. The symptom was the macro grams on the
          onboarding target screen rendering too small to read. Line height
          derives from the font size instead, which is what the shrink needs in
          order to compute anything sensible.

          The floor is high enough that even a misbehaving shrink stays legible. */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        className={cn('font-display text-[24px]', palette.label)}
      >
        {value}
      </Text>
      {/* Tighter than `overline`: three of these sit side by side on a 393pt
          screen, and the wider tracking wraps "PROTEIN" onto two lines.

          No auto-shrink, for the reason above — `overlineSm` carries its own
          lineHeight and a variant is not the place to unpick it. These labels are
          a fixed set of short words ("CARBS", "PROTEIN", "GOAL DATE") that fit at
          12px, and `numberOfLines` keeps the longest of them on one line. */}
      <Text numberOfLines={1} variant="overlineSm">
        {label}
      </Text>
      {caption ? <Text variant="meta">{caption}</Text> : null}
    </Squish>
  )
}
