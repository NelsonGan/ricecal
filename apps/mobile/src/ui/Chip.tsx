import type { ReactNode } from 'react'

import { radius, slab } from '@/theme/tokens'
import { cn } from './cn'
import { Squish, type SquishProps } from './Squish'
import { Text } from './Text'

const tones = {
  pandan: {
    filled: 'bg-pandan',
    slab: 'bg-pandan-slab',
    filledLabel: 'text-on-pandan',
    soft: 'bg-pandan-soft',
    softLabel: 'text-pandan-ink',
  },
  kaya: {
    filled: 'bg-kaya',
    slab: 'bg-kaya-slab',
    filledLabel: 'text-on-kaya',
    soft: 'bg-kaya-soft',
    softLabel: 'text-kaya-ink',
  },
  hibiscus: {
    filled: 'bg-hibiscus',
    slab: 'bg-hibiscus-slab',
    filledLabel: 'text-on-hibiscus',
    soft: 'bg-hibiscus-soft',
    softLabel: 'text-hibiscus-ink',
  },
  water: {
    filled: 'bg-water',
    slab: 'bg-water-slab',
    filledLabel: 'text-on-water',
    soft: 'bg-water-soft',
    softLabel: 'text-water-ink',
  },
} as const

export type ChipTone = keyof typeof tones

export type ChipProps = Omit<SquishProps, 'className' | 'slabClassName' | 'depth' | 'radius'> & {
  children: ReactNode
  /** Filled with the accent and raised on a slab. */
  selected?: boolean
  tone?: ChipTone
  /** Flat tinted, no outline, no slab. Read-only tags and unit hints. */
  soft?: boolean
  leftIcon?: ReactNode
  className?: string
}

/**
 * A pill: dietary filters, serving units, status tags.
 *
 * Every state reserves the slab's 4pt, and unselected chips simply leave it
 * transparent. Sizing the box the same in all states is what stops a wrapped
 * filter row from reflowing each time one is tapped — and the unselected chip
 * still travels on press, so it feels alive.
 */
export function Chip({
  children,
  selected = false,
  tone = 'pandan',
  soft = false,
  leftIcon,
  disabled,
  className,
  onPress,
  ...rest
}: ChipProps) {
  const palette = tones[tone]
  const raised = selected && !soft

  const fill = soft
    ? palette.soft
    : selected
      ? palette.filled
      : 'bg-surface border-[3px] border-line'
  const label = soft ? palette.softLabel : selected ? palette.filledLabel : 'text-muted'

  return (
    <Squish
      depth={slab.sm}
      radius={radius.full}
      containerClassName={cn('self-start', className)}
      slabClassName={raised ? palette.slab : 'bg-transparent'}
      className={cn(
        'flex-row items-center gap-1.5 px-[18px] py-2.5',
        fill,
        disabled && 'opacity-50',
      )}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected, disabled: Boolean(disabled) } : undefined}
      {...rest}
    >
      {leftIcon}
      <Text className={cn('font-body-black text-[15px] leading-[20px]', label)}>{children}</Text>
    </Squish>
  )
}
