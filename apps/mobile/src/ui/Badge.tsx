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

/**
 * Two sizes, and the small one is for a pill that rides ALONGSIDE something
 * rather than standing on its own.
 *
 * The default is a status pill with a row to itself. Set beside a label — the
 * saving on the yearly plan, next to the word "Yearly" — it has to read as an
 * annotation of that label instead of competing with it, and at the full size
 * it made the one card carrying it a head taller than the two beside it.
 */
const sizes = {
  md: { box: 'px-[18px] py-2.5', label: 'text-[15px] leading-[18px]' },
  sm: { box: 'px-2.5 py-1', label: 'text-[12px] leading-[15px]' },
} as const

export type BadgeTone = keyof typeof tones
export type BadgeSize = keyof typeof sizes

export type BadgeProps = ViewProps & {
  children: ReactNode
  tone?: BadgeTone
  size?: BadgeSize
  className?: string
  /** Overrides the tone's label colour, for a pill drawn on a solid ground. */
  labelClassName?: string
}

/**
 * A static status pill: "On track", "1 day streak", "Active".
 *
 * Not pressable by design. If it needs to respond to a tap it is a `Chip`, and
 * the difference matters — a pill that looks tappable and is not is worse than
 * either.
 *
 * Only *text* children get wrapped in `Text`. Wrapping unconditionally is what
 * misaligned the flame on the streak pill: an `<Image>` nested inside a `<Text>`
 * is laid out by the text engine as an inline attachment, sitting on the
 * baseline rather than centred against the label, and no amount of `items-center`
 * on the row could move it. It also read as `￼0 day streak` to VoiceOver — the
 * object-replacement character the attachment leaves in the string.
 */
export function Badge({
  children,
  tone = 'pandan',
  size = 'md',
  className,
  labelClassName,
  ...rest
}: BadgeProps) {
  const isText = typeof children === 'string' || typeof children === 'number'

  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5 self-start rounded-full',
        sizes[size].box,
        tones[tone],
        className,
      )}
      {...rest}
    >
      {isText ? (
        <Text className={cn('font-body-black', sizes[size].label, labels[tone], labelClassName)}>
          {children}
        </Text>
      ) : (
        children
      )}
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
