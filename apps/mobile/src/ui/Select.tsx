import { useState } from 'react'
import { View } from 'react-native'

import { cn } from './cn'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { Tappable } from './Tappable'
import { Text } from './Text'

export type SelectOption<T extends string> = {
  value: T
  label: string
  description?: string
}

export type SelectProps<T extends string> = {
  options: readonly SelectOption<T>[]
  value: T | null
  onChange: (value: T) => void
  label?: string
  /**
   * Keep the label as the control's NAME without drawing it.
   *
   * For a picker that already sits under a card heading saying the same word.
   * The label still titles the sheet and still names the control for a screen
   * reader, so hiding it costs nothing but the duplicated line.
   */
  hideLabel?: boolean
  /**
   * Shown until something is chosen, and read out as the value.
   *
   * Optional with NO default. It used to default to 'Select', which is an
   * English word the design system had no business owning. A `Select` whose
   * value cannot be null never renders this and should not be made to invent
   * one; a `Select` whose value can be null has to pass it.
   */
  placeholder?: string
  /** Screen-reader name for the sheet's drag handle. Translated. */
  closeLabel: string
  disabled?: boolean
  className?: string
}

/**
 * A single-choice picker that opens its options in a sheet.
 *
 * A sheet rather than an inline expanding list: option lists here can be long
 * (sources, units, cuisines), and an inline list pushes the rest of the form
 * down and often lands the option you want underneath the keyboard.
 *
 * Generic over the value type so `onChange` returns the literal union.
 */
export function Select<T extends string>({
  options,
  value,
  onChange,
  label,
  hideLabel = false,
  placeholder,
  closeLabel,
  disabled = false,
  className,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value)

  return (
    <View className={cn('gap-1.5', className)}>
      {label && !hideLabel ? <Text variant="label">{label}</Text> : null}

      <Tappable
        onPress={() => setOpen(true)}
        disabled={disabled}
        className={cn(
          'min-h-md flex-row items-center gap-3 rounded-md border-[3px] border-line bg-surface px-[18px]',
          disabled && 'opacity-50',
        )}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label ?? placeholder }}
        accessibilityState={{ expanded: open, disabled }}
      >
        <Text
          variant="bodyStrong"
          className={cn('flex-1', !selected && 'font-body-bold text-faint')}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Icon set="ui" name="chevron-down" size={20} />
      </Tappable>

      <Sheet visible={open} onClose={() => setOpen(false)} title={label} closeLabel={closeLabel}>
        <View>
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
                  'min-h-sm flex-row items-center gap-3 py-4',
                  index > 0 && 'border-t-2 border-track',
                )}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: isSelected }}
              >
                <View className="flex-1 gap-0.5">
                  <Text
                    variant="bodyStrong"
                    className={cn(isSelected ? 'text-pandan-ink' : 'font-body-bold')}
                  >
                    {option.label}
                  </Text>
                  {option.description ? <Text variant="meta">{option.description}</Text> : null}
                </View>
                {isSelected ? <Icon set="ui" name="check" size={22} /> : null}
              </Tappable>
            )
          })}
        </View>
      </Sheet>
    </View>
  )
}
