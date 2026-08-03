import { View } from 'react-native'

import { cn, Icon, type IconProps, Text } from '@/ui'

export type SplitPart = {
  key: string
  label: string
  caption: string
  value: string
  /** Share of the whole, 0–1. */
  share: number
  fill: string
  icon: IconProps
}

export type SplitBarProps = {
  parts: readonly SplitPart[]
  accessibilityLabel?: string
  className?: string
}

/**
 * Where a range's burn came from: resting, workouts, walking.
 *
 * One stacked bar and then the same three parts as rows. The bar alone cannot
 * carry three numbers legibly — resting is usually four fifths of it and the
 * other two are slivers — and the rows alone lose the proportion, which is the
 * point being made: the body spends most of its energy doing nothing, and the
 * hour at the gym is a smaller slice than anybody expects.
 *
 * `flexGrow` with `flexBasis: 0` for the segments, for the reason `StackedBars`
 * gives: without the basis, flexbox divides only the leftover space and the
 * shares stop being the shares as soon as one goes to zero.
 */
export function SplitBar({ parts, accessibilityLabel, className }: SplitBarProps) {
  return (
    <View className={cn('gap-4', className)}>
      <View
        className="h-4 flex-row overflow-hidden rounded-full bg-track"
        accessible={Boolean(accessibilityLabel)}
        accessibilityRole={accessibilityLabel ? 'image' : undefined}
        accessibilityLabel={accessibilityLabel}
      >
        {parts.map((part) =>
          // Under 1% a segment is a hairline that reads as a rendering artefact.
          // The row below still carries its number, so nothing is lost.
          part.share < 0.01 ? null : (
            <View
              key={part.key}
              className={part.fill}
              style={{ flexGrow: part.share, flexBasis: 0 }}
            />
          ),
        )}
      </View>

      <View className="gap-3">
        {parts.map((part) => (
          <View key={part.key} className="flex-row items-center gap-md">
            <Icon {...part.icon} size={28} />
            <View className="min-w-0 flex-1">
              <Text variant="bodyStrong" numberOfLines={1}>
                {part.label}
              </Text>
              <Text variant="meta" numberOfLines={1}>
                {part.caption}
              </Text>
            </View>
            <Text variant="label" className="text-heading">
              {part.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
