import { ScrollView, View } from 'react-native'

import { cn } from './cn'
import { Tappable } from './Tappable'
import { Text } from './Text'

export type TabOption<T extends string> = {
  value: T
  label: string
}

export type TabsProps<T extends string> = {
  options: readonly TabOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Let the strip scroll horizontally when the labels do not fit. */
  scrollable?: boolean
  /**
   * Where the strip sits in the width it is given.
   *
   * `start` is right for a set that can grow or overflow, where a centred strip
   * would shift every label sideways as tabs are added. `center` is for a short
   * fixed pair that reads as one control — two tabs hard against the left edge
   * look like the beginning of a longer list that is missing.
   *
   * Ignored when `scrollable`, where the content owns its own offset.
   */
  align?: 'start' | 'center'
  accessibilityLabel?: string
  className?: string
}

/**
 * Underlined tabs for switching views within a screen — Overview, Nutrients,
 * Similar.
 *
 * Distinct from `SegmentedControl`: tabs switch between *views* of one subject
 * and can overflow, a segmented control picks a *value* from a short fixed set.
 * They look different for that reason and are not interchangeable.
 *
 * The active underline is an inset border rather than an absolutely positioned
 * bar, so it cannot drift out of alignment when a label wraps or the font
 * scales up.
 */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  scrollable = false,
  align = 'start',
  accessibilityLabel,
  className,
}: TabsProps<T>) {
  const strip = options.map((option) => {
    const selected = option.value === value
    return (
      <Tappable
        key={option.value}
        onPress={() => onChange(option.value)}
        className={cn(
          'min-h-sm justify-center border-b-[4px] px-1 py-3',
          selected ? 'border-pandan' : 'border-transparent',
        )}
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
      </Tappable>
    )
  })

  const content = (
    <View className={cn('flex-row gap-lg', align === 'center' && 'justify-center')}>{strip}</View>
  )

  return (
    <View
      className={cn('border-b-2 border-track', className)}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {scrollable ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </View>
  )
}
