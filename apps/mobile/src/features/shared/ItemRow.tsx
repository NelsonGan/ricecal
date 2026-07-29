import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'

import type { IconRef } from '@/mock'
import { cn, Icon, Text } from '@/ui'

const valueTones = {
  ink: 'text-ink',
  hibiscus: 'text-hibiscus-ink',
} as const

export type ItemRowProps = {
  /** The dish, the workout, the thing. */
  title: string
  /** "1 plate", "8:20 am", "Mamak · 1 piece", "6:40 am · 34 min · 5.1 km". */
  detail?: string
  icon: IconRef
  /** The number on the right. */
  value: number | string
  /** What the number is in. Omit for a unitless count. */
  unit?: string
  /** Calories burned read in hibiscus; everything else in ink. */
  valueTone?: keyof typeof valueTones
  /** Highlights the row — used for the entry that was just added. */
  highlighted?: boolean
  /** Sits after the value. An add button, a match badge. */
  trailing?: ReactNode
  onPress?: () => void
  className?: string
}

/**
 * The row that carries almost every list in the app: a dish on Today, a search
 * result, a workout, a top food, a locked entry behind the paywall.
 *
 * One component rather than six near-copies, because near-copies drift — the
 * tile was 56pt in one place and 48 in another, the gap 12 here and 14 there,
 * and the calorie count sat on a different baseline depending on the screen.
 */
export function ItemRow({
  title,
  detail,
  icon,
  value,
  unit,
  valueTone = 'ink',
  highlighted = false,
  trailing,
  onPress,
  className,
}: ItemRowProps) {
  const body = (
    <>
      <View className="h-[56px] w-[56px] items-center justify-center rounded-tile bg-track">
        <Icon {...icon} size={40} />
      </View>

      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text variant="meta" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>

      <View className="flex-row items-baseline gap-1">
        <Text variant="numeric" className={cn('text-[19px] leading-[24px]', valueTones[valueTone])}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </Text>
        {unit ? <Text variant="caption">{unit}</Text> : null}
      </View>

      {trailing}
    </>
  )

  const classes = cn(
    'flex-row items-center gap-3 rounded-tile',
    highlighted && 'bg-pandan-soft p-2.5',
    className,
  )

  if (!onPress) {
    return <View className={classes}>{body}</View>
  }

  return (
    <Pressable
      className={classes}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, unit ? `${value} ${unit}` : String(value), detail]
        .filter(Boolean)
        .join(', ')}
    >
      {body}
    </Pressable>
  )
}
