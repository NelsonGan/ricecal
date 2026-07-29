import { View } from 'react-native'

import { cn, Icon, type IconProps, Squish, Text } from '@/ui'

const tones = {
  pandan: { fill: 'bg-pandan-soft', slab: 'bg-pandan-soft-line' },
  kaya: { fill: 'bg-kaya-soft', slab: 'bg-kaya-soft-line' },
  hibiscus: { fill: 'bg-hibiscus-soft', slab: 'bg-hibiscus-soft-line' },
  neutral: { fill: 'bg-track', slab: 'bg-line-strong' },
} as const

export type QuickActionProps = {
  label: string
  icon: IconProps
  tone?: keyof typeof tones
  onPress: () => void
  className?: string
}

/** One of the four squares in the log sheet: snap, scan, say, search. */
export function QuickAction({
  label,
  icon,
  tone = 'neutral',
  onPress,
  className,
}: QuickActionProps) {
  const colors = tones[tone]

  return (
    <Squish
      depth={4}
      radius={18}
      containerClassName={cn('flex-1', className)}
      slabClassName={colors.slab}
      className={cn('items-center justify-center gap-2 px-1.5 py-3.5', colors.fill)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon {...icon} size={26} />
      <View>
        <Text variant="micro" className="text-ink">
          {label}
        </Text>
      </View>
    </Squish>
  )
}
