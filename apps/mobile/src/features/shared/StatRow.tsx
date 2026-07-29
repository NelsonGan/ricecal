import { View } from 'react-native'

import { cn, Text } from '@/ui'

export type Stat = {
  key: string
  /** Rendered in caps above the value. */
  label: string
  value: string
}

export type StatRowProps = {
  stats: readonly Stat[]
  /** Bigger numerals, for a hero row rather than a footnote row. */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * A row of small label-over-value pairs.
 *
 * Two or three per row; four stops fitting on a 340pt phone without the labels
 * wrapping, which is why callers split rather than the component.
 */
export function StatRow({ stats, size = 'sm', className }: StatRowProps) {
  return (
    <View className={cn('flex-row gap-md', className)}>
      {stats.map((stat) => (
        <View key={stat.key} className="min-w-0 flex-1 gap-0.5">
          <Text variant="overlineSm">{stat.label}</Text>
          <Text
            className={cn(
              'font-display text-ink',
              size === 'md' ? 'text-[22px] leading-[27px]' : 'text-[18px] leading-[23px]',
            )}
            numberOfLines={1}
          >
            {stat.value}
          </Text>
        </View>
      ))}
    </View>
  )
}
