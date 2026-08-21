import type { ReactNode } from 'react'
import { View } from 'react-native'

import { radius, slab } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'
import { cn } from './cn'
import { Squish, type SquishProps } from './Squish'
import { Text } from './Text'

/**
 * A card's tone is its fill. The soft accents are for cards that carry a state
 * — a nudge, a warning — not for decoration. "Two backgrounds only" is the
 * rule; every accent fill here is a deliberate exception to it.
 */
const tones = {
  surface: { fill: 'bg-surface', slab: 'bg-line', border: 'border-line' },
  pandan: {
    fill: 'bg-pandan-soft',
    slab: 'bg-pandan-soft-line',
    border: 'border-pandan-soft-line',
  },
  kaya: { fill: 'bg-kaya-soft', slab: 'bg-kaya-soft-line', border: 'border-kaya-soft-line' },
  hibiscus: {
    fill: 'bg-hibiscus-soft',
    slab: 'bg-hibiscus-soft-line',
    border: 'border-hibiscus-soft-line',
  },
  water: { fill: 'bg-water-soft', slab: 'bg-water-soft-line', border: 'border-water-soft-line' },
  /** The one inverted surface: fasting mode, night mode. */
  inverse: { fill: 'bg-inverse', slab: 'bg-inverse', border: 'border-inverse' },
} as const

export type CardTone = keyof typeof tones

export type CardProps = Omit<SquishProps, 'className' | 'slabClassName' | 'depth' | 'radius'> & {
  tone?: CardTone
  /** Section marker rendered above the content, e.g. "REMAINING TODAY". */
  title?: string
  /** Rendered opposite the title — a status pill, a total. */
  action?: ReactNode
  /**
   * Rendered immediately AFTER the title, not opposite it.
   *
   * For something that belongs to the heading rather than to the card: the info
   * button beside "LANGUAGE" is asking about that word, and pushed to the far
   * edge by `action` it reads as a control for the card's contents instead.
   */
  titleAction?: ReactNode
  /** Drop the interior padding, for content that bleeds to the card edge. */
  flush?: boolean
  /** Layout. Lands on the box the parent measures. */
  className?: string
  /** The card's own surface — override padding here, not in `className`. */
  contentClassName?: string
  children?: ReactNode
}

/**
 * The standard surface: 28px radius, 28px padding, a slab underneath.
 *
 * Dark mode swaps the slab for a hairline border. That is a rule of the system
 * rather than a shortcut — a solid drop under a dark card on a dark canvas
 * reads as a smudge, so the depth cue moves to the outline. Buttons keep their
 * slab in both modes, which is why this lives here and not in `Squish`.
 */
export function Card({
  tone = 'surface',
  title,
  action,
  titleAction,
  flush = false,
  className,
  contentClassName,
  children,
  ...rest
}: CardProps) {
  const { isDark } = useTheme()
  const palette = tones[tone]
  const hasHeader = Boolean(title) || Boolean(action)

  return (
    <Squish
      depth={isDark ? 0 : slab.md}
      radius={radius.card}
      containerClassName={className}
      slabClassName={palette.slab}
      className={cn(
        palette.fill,
        isDark && `border ${palette.border}`,
        // Every card spaces its own children. Without this each caller invents
        // its own gap or, more often, forgets — and two elements in a card end
        // up touching on one screen and not on another.
        //
        // Tighter than the gap between cards, so the eye groups what is inside
        // one card before it groups the cards themselves. A list card whose
        // rows carry their own dividers passes `contentClassName="gap-0"` to
        // sit flush.
        'gap-3',
        !flush && 'p-card',
        contentClassName,
      )}
      haptics={false}
      {...rest}
    >
      {hasHeader ? (
        // `flush` drops the card's padding for content that bleeds to the edge,
        // but the header is chrome, not content — without its own padding the
        // title renders hard against the rounded corner and is clipped by it.
        <View
          className={cn('flex-row items-center justify-between gap-3', flush && 'px-card pt-card')}
        >
          {title ? (
            // `shrink` on both, so a long translated heading gives up width to
            // wrap rather than shouldering the button off the card.
            <View className="min-w-0 shrink flex-row items-center gap-1.5">
              <Text variant="overline" className="shrink">
                {title}
              </Text>
              {titleAction}
            </View>
          ) : null}
          {action}
        </View>
      ) : null}
      {children}
    </Squish>
  )
}
