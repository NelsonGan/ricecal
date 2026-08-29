import { useState } from 'react'
import { View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { cn, Icon, Tappable, Text } from '@/ui'

export type DropdownOption<T extends string> = {
  value: T
  label: string
}

export type DropdownProps<T extends string> = {
  options: readonly DropdownOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Shown when nothing on the list matches the value. */
  placeholder?: string
  accessibilityLabel?: string
  className?: string
}

/**
 * A dropdown that opens in place, under its own field.
 *
 * The ask sheet's questions were rows of chips, which reads well with four
 * options and badly with a list somebody can add to: a wrapped row of pills is a
 * control whose height depends on how much typing the user has done.
 *
 * `Select` is the same idea and opens its options in a `Sheet`, which is a native
 * `Modal`, and this is used inside a sheet. Opening inline costs a scroll on a
 * long list, and the ask sheet already scrolls.
 *
 * Generic over the value type, for the reason `Select` is: `onChange` hands back
 * the literal union rather than `string`, so neither call site needs a cast.
 *
 * Feature-local. A second screen wanting it is the moment it becomes a
 * design-system component with a gallery entry.
 */
export function Dropdown<T extends string>({
  options,
  value,
  onChange,
  placeholder = '',
  accessibilityLabel,
  className,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const colors = useThemeColors()
  const selected = options.find((option) => option.value === value)

  return (
    <View className={cn('gap-2', className)}>
      <Tappable
        onPress={() => setOpen((on) => !on)}
        className="min-h-md flex-row items-center gap-3 rounded-md border-[3px] border-line bg-surface px-[18px]"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: selected?.label ?? placeholder }}
        accessibilityState={{ expanded: open }}
      >
        <Text
          variant="bodyStrong"
          className={cn('flex-1', !selected && 'font-body-bold text-faint')}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder}
        </Text>
        {/* The chevron reports the panel's state rather than offering the other
            one, which is the opposite of the calendar toggle on Today and right
            for the opposite reason: that toggle swaps a whole screen and this
            one only opens the thing directly underneath it, where an arrow
            pointing away from the list it belongs to reads as wrong. */}
        <Icon
          set="ui"
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          tintColor={colors.muted}
        />
      </Tappable>

      {open ? (
        <View className="overflow-hidden rounded-md border-[3px] border-line bg-surface">
          {options.map((option, index) => {
            const isSelected = option.value === value
            return (
              <Tappable
                key={option.value}
                onPress={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  'min-h-sm flex-row items-center gap-3 px-[18px] py-3.5',
                  index > 0 && 'border-t-2 border-track',
                )}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: isSelected }}
              >
                <Text
                  variant="bodyStrong"
                  className={cn('flex-1', isSelected ? 'text-pandan-ink' : 'font-body-bold')}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
                {isSelected ? <Icon set="ui" name="check" size={20} /> : null}
              </Tappable>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}
