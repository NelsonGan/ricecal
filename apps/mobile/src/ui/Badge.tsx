import type { ReactNode } from 'react'
import { View, type ViewProps } from 'react-native'

import { cn } from './cn'
import { Text } from './Text'

const tones = {
  pandan: 'bg-pandan-soft',
  kaya: 'bg-kaya-soft',
  hibiscus: 'bg-hibiscus-soft',
  water: 'bg-water-soft',
  neutral: 'bg-track',
} as const

const labels = {
  pandan: 'text-pandan-ink',
  kaya: 'text-kaya-ink',
  hibiscus: 'text-hibiscus-ink',
  water: 'text-water-ink',
  neutral: 'text-muted',
} as const

export type BadgeTone = keyof typeof tones

export type BadgeProps = ViewProps & {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}

/**
 * A static status pill: "On track", "96% match", "Active".
 *
 * Not pressable by design. If it needs to respond to a tap it is a `Chip`, and
 * the difference matters — a pill that looks tappable and is not is worse than
 * either.
 */
export function Badge({ children, tone = 'pandan', className, ...rest }: BadgeProps) {
  return (
    <View
      className={cn('self-start rounded-full px-[18px] py-2.5', tones[tone], className)}
      {...rest}
    >
      <Text className={cn('font-body-black text-[15px] leading-[18px]', labels[tone])}>
        {children}
      </Text>
    </View>
  )
}

export type CountBadgeProps = ViewProps & {
  count: number
  /** Anything above this renders as "N+". */
  max?: number
  className?: string
}

/**
 * The small red counter that rides on a tab or a bell.
 *
 * Renders nothing at zero — an empty badge is noise, and callers should not
 * each have to remember to guard for it.
 */
export function CountBadge({ count, max = 99, className, ...rest }: CountBadgeProps) {
  if (count <= 0) return null

  return (
    <View
      className={cn(
        'h-[26px] min-w-[26px] items-center justify-center rounded-full bg-hibiscus px-2',
        className,
      )}
      accessibilityLabel={`${count}`}
      {...rest}
    >
      <Text className="font-display text-[14px] leading-[16px] text-on-hibiscus">
        {count > max ? `${max}+` : count}
      </Text>
    </View>
  )
}
