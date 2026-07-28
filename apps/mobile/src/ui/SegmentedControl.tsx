import { View } from 'react-native'

import { radius } from '@/theme/tokens'
import { cn } from './cn'
import { Squish } from './Squish'
import { Text } from './Text'

export type SegmentedOption<T extends string> = {
  value: T
  label: string
}

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Read out before the segment labels. */
  accessibilityLabel?: string
  className?: string
}

/** Shallower than a button's: the segment sits inside a track, not on the canvas. */
const SEGMENT_DEPTH = 3

/**
 * A segmented control — meal slot, unit system, chart range.
 *
 * Generic over the option values so `onChange` returns the literal union rather
 * than `string`. A caller switching on the result then gets exhaustiveness
 * checking instead of a stringly-typed default branch.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <View
      className={cn('flex-row gap-1.5 rounded-md bg-track p-1.5', className)}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Squish
            key={option.value}
            depth={SEGMENT_DEPTH}
            radius={radius.sm + 1}
            slabClassName={cn('flex-1', selected ? 'bg-line-strong' : 'bg-transparent')}
            className={cn('items-center py-3', selected ? 'bg-surface' : 'bg-transparent')}
            haptics={false}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text
              className={cn(
                'font-display text-[16px] leading-[20px]',
                selected ? 'text-heading' : 'text-muted',
              )}
            >
              {option.label}
            </Text>
          </Squish>
        )
      })}
    </View>
  )
}
