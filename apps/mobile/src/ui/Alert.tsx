import type { ReactNode } from 'react'
import { View } from 'react-native'

import { cn } from './cn'
import { Icon, type IconProps } from './Icon'
import { Text } from './Text'

const tones = {
  success: { fill: 'bg-pandan-soft', border: 'border-pandan-soft-line', mark: 'bg-pandan' },
  warning: { fill: 'bg-kaya-soft', border: 'border-kaya-soft-line', mark: 'bg-kaya' },
  error: { fill: 'bg-hibiscus-soft', border: 'border-hibiscus-soft-line', mark: 'bg-hibiscus' },
  info: { fill: 'bg-water-soft', border: 'border-water-soft-line', mark: 'bg-water' },
} as const

export type AlertTone = keyof typeof tones

export type AlertProps = {
  title: string
  description?: string
  tone?: AlertTone
  /** Replaces the colour mark. */
  icon?: IconProps
  /** Trailing action, e.g. a small "Retry" button. */
  action?: ReactNode
  className?: string
}

/**
 * An inline banner: saved, double-check, sync failed.
 *
 * Tone is carried by fill, border and a colour mark together, never by colour
 * alone — the three most common forms of colour blindness all affect at least
 * one of these four hues, and "sync failed" has to land regardless.
 *
 * `accessibilityLiveRegion` announces it when it appears mid-screen, which is
 * the usual case: it shows up after a save or a failed fetch.
 */
export function Alert({
  title,
  description,
  tone = 'success',
  icon,
  action,
  className,
}: AlertProps) {
  const palette = tones[tone]

  return (
    <View
      className={cn(
        'flex-row items-start gap-md rounded-md border-[3px] p-lg',
        palette.fill,
        palette.border,
        className,
      )}
      accessibilityRole="alert"
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
    >
      {icon ? (
        <Icon {...icon} size={26} />
      ) : (
        <View className={cn('h-[26px] w-[26px] shrink-0 rounded-[9px]', palette.mark)} />
      )}

      <View className="flex-1 gap-0.5">
        <Text variant="bodyStrong" className="text-[16px]">
          {title}
        </Text>
        {description ? <Text variant="meta">{description}</Text> : null}
      </View>

      {action}
    </View>
  )
}
