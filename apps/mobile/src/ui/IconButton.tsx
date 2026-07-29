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
