import { View } from 'react-native'

import { cn, Icon, type IconProps, Squish, Text } from '@/ui'

const tones = {
  pandan: { fill: 'bg-pandan-soft', slab: 'bg-pandan-soft-line' },
  kaya: { fill: 'bg-kaya-soft', slab: 'bg-kaya-soft-line' },
  hibiscus: { fill: 'bg-hibiscus-soft', slab: 'bg-hibiscus-soft-line' },
  water: { fill: 'bg-water-soft', slab: 'bg-water-soft-line' },
  neutral: { fill: 'bg-track', slab: 'bg-line-strong' },
} as const

export type QuickActionProps = {
  label: string
  icon: IconProps
  tone?: keyof typeof tones
  /**
   * Marks the action whose panel is open below. Snap and scan now toggle a
   * viewfinder inside the sheet rather than pushing a screen, so the square has
   * an on state where before every tap navigated away.
   */
  selected?: boolean
  onPress: () => void
  /**
   * Icon beside the label in a short bar, rather than above it in a square.
   * Used once a panel is open, so the panel gets the height the squares were
   * holding: with the camera up, that is the difference between a viewfinder
   * and a letterbox.
   */
  compact?: boolean
  className?: string
}

/** One of the three squares in the log sheet: snap, describe, search. */
export function QuickAction({
  label,
  icon,
  tone = 'neutral',
  selected = false,
  onPress,
  compact = false,
  className,
}: QuickActionProps) {
  const colors = tones[tone]

  return (
    <Squish
      // Pressed flat while its panel is open: the square reads as held down,
      // which is what "this is the one you are using" looks like in a design
      // built on raised slabs.
      depth={selected ? 0 : 4}
      radius={18}
      containerClassName={cn('flex-1', className)}
      slabClassName={colors.slab}
      className={cn(
        compact
          ? 'flex-row items-center justify-center gap-1.5 px-1.5 py-2.5'
          : 'items-center justify-center gap-2 px-1.5 py-3.5',
        colors.fill,
        selected && 'border-[3px] border-ink',
      )}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      <Icon {...icon} size={compact ? 22 : 26} />
      {/* Shrinks beside the icon in a compact bar, so a long translation is cut
          short inside the tile rather than running out of it. */}
      <View className={compact ? 'shrink' : undefined}>
        <Text variant="micro" className="text-ink" numberOfLines={compact ? 1 : undefined}>
          {label}
        </Text>
      </View>
    </Squish>
  )
}
