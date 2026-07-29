import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'

import type { IconRef } from '@/mock'
import { cn, Icon, Text } from '@/ui'

export type FoodRowProps = {
  name: string
  /** "1 plate", "8:20 am", "Mamak · 1 piece". */
  detail?: string
  icon: IconRef
  kcal: number
  /** Highlights the row — used for the entry that was just added. */
  highlighted?: boolean
  /** Replaces nothing; sits after the calorie count. An add button, a badge. */
  trailing?: ReactNode
  onPress?: () => void
  className?: string
}

/**
 * A dish in a list: tile, name, detail line, calorie count.
 *
 * Used on Today, the diary, search results, the quick selector and the locked
 * preview, which is why the calorie count is a number rather than a string —
 * every caller was otherwise formatting it slightly differently.
 */
export function FoodRow({
  name,
  detail,
  icon,
  kcal,
  highlighted = false,
  trailing,
  onPress,
  className,
}: FoodRowProps) {
  const body = (
    <>
      <View className="h-[56px] w-[56px] items-center justify-center rounded-tile bg-track">
        <Icon {...icon} size={40} />
      </View>

      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="bodyStrong" numberOfLines={1}>
          {name}
        </Text>
        {detail ? (
          <Text variant="meta" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>

      <View className="flex-row items-baseline gap-1">
        <Text className="font-display text-[19px] leading-[24px] text-ink">
          {kcal.toLocaleString()}
        </Text>
        <Text variant="caption">kcal</Text>
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
      accessibilityLabel={`${name}, ${kcal} kcal${detail ? `, ${detail}` : ''}`}
    >
      {body}
    </Pressable>
  )
}
