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
  track: { fill: 'bg-track', slab: 'bg-line-strong', label: 'text-heading' },
} as const

export type StatTileTone = keyof typeof tones

export type StatTileProps = {
  /** Caps label above the value: "PACE", "GOAL DATE". */
  label: string
  /** The number or short phrase. */
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
      slabClassName={cn(palette.slab, className)}
      // `grow` matters when tiles sit in a row: the slab layer stretches to the
      // tallest sibling, and without this the surface keeps its content height
      // and leaves a bare strip of slab showing underneath.
      className={cn('grow gap-2 p-lg', palette.fill)}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={caption}
    >
      {icon}
      <Text variant="overline">{label}</Text>
      {/* Wraps rather than shrinks. `adjustsFontSizeToFit` looks tidy on one
          tile and wrong on a row of them: a long value drops to 14px next to a
          short one still at 24px, and identical tiles stop looking identical.
          `grow` above already keeps the row's heights equal, so a value on two
          lines costs nothing. */}
      <Text className={cn('font-display text-[24px] leading-[30px]', palette.label)}>{value}</Text>
      {caption ? <Text variant="meta">{caption}</Text> : null}
    </Squish>
  )
}
