import type { ReactNode } from 'react'

import { radius, slab } from '@/theme/tokens'
import { cn } from './cn'
import { Squish, type SquishProps } from './Squish'

const tones = {
  primary: { slab: 'bg-pandan-slab', surface: 'bg-pandan' },
  neutral: { slab: 'bg-line', surface: 'bg-surface border-[3px] border-line' },
  subtle: { slab: 'bg-line-strong', surface: 'bg-track' },
  ghost: { slab: '', surface: 'bg-transparent' },
} as const

const sizes = {
  /**
   * As tall as a line of `subtitle` text, for a control that shares a heading's
   * line — the suggestion glyph beside "Log a dish". Anything larger makes the
   * heading's row taller than the heading.
   *
   * The 44pt floor is MOVED rather than waived here too, and further: a caller
   * owes this one a `hitSlop` of 8.
   */
  xxs: { box: 'w-[28px] h-[28px]', radius: radius.sm - 4, depth: slab.sm },
  /**
   * Smaller than the 44pt floor, and only where the button has to LINE UP with
   * something that is not a button — the view toggle beside the streak badge on
   * Today, which reads as a mismatched pair at any other height.
   *
   * The floor is not waived, it is moved: a caller using this owes the control a
   * `hitSlop` that takes the touch target back to 44. `IconButton` cannot supply
   * one itself, because the slop it needs depends on what is next to it.
   */
  xs: { box: 'w-[38px] h-[38px]', radius: radius.sm - 2, depth: slab.sm },
  /** The floor for anything tappable. */
  sm: { box: 'w-[44px] h-[44px]', radius: radius.sm, depth: slab.sm },
  md: { box: 'w-[56px] h-[56px]', radius: 18, depth: slab.md },
  lg: { box: 'w-[64px] h-[64px]', radius: radius.tile, depth: slab.lg },
} as const

export type IconButtonVariant = keyof typeof tones
export type IconButtonSize = keyof typeof sizes

export type IconButtonProps = Omit<
  SquishProps,
  'children' | 'className' | 'slabClassName' | 'depth' | 'radius'
> & {
  children: ReactNode
  variant?: IconButtonVariant
  size?: IconButtonSize
  /** Layout. Lands on the box the parent measures. */
  className?: string
  /** Appearance of the pressable surface. Rarely needed — use `variant`. */
  contentClassName?: string
  /** Required: an icon-only control has no visible label to read out. */
  accessibilityLabel: string
}

/**
 * A square squishy button — back chevrons, stepper plus and minus, the header
 * overflow control.
 *
 * `accessibilityLabel` is mandatory rather than optional. There is no text to
 * fall back on, so an unlabelled icon button is silent to a screen reader, and
 * that is not something to leave to a reviewer to notice.
 */
export function IconButton({
  children,
  variant = 'neutral',
  size = 'md',
  disabled,
  className,
  contentClassName,
  ...rest
}: IconButtonProps) {
  const tone = tones[variant]
  const metrics = sizes[size]

  return (
    <Squish
      depth={variant === 'ghost' ? 0 : disabled ? slab.sm : metrics.depth}
      radius={metrics.radius}
      containerClassName={cn('self-start', className)}
      slabClassName={disabled ? 'bg-disabled-slab' : tone.slab}
      className={cn(
        'items-center justify-center',
        metrics.box,
        disabled ? 'bg-disabled' : tone.surface,
        contentClassName,
      )}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      {...rest}
    >
      {children}
    </Squish>
  )
}
