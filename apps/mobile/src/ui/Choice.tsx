import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'

import { cn } from './cn'
import { Squish } from './Squish'
import { Text } from './Text'

type BaseProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  /** Second line under the label. */
  description?: string
  disabled?: boolean
  className?: string
  children?: ReactNode
}

/**
 * Shared row shell for Checkbox and Radio.
 *
 * The whole row is the target, not just the 28pt box — a 28pt hit area is below
 * the 44pt floor, and nobody aims for the box when there is a label next to it.
 */
function ChoiceRow({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
  role,
  children,
}: BaseProps & { role: 'checkbox' | 'radio' }) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        'min-h-sm flex-row items-center gap-3 py-1',
        disabled && 'opacity-50',
        className,
      )}
      accessibilityRole={role}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      accessibilityHint={description}
    >
      {children}
      {label || description ? (
        <View className="flex-1 gap-0.5">
          {label ? (
            <Text variant="bodyStrong" className={cn(!checked && 'font-body-bold text-muted')}>
              {label}
            </Text>
          ) : null}
          {description ? <Text variant="meta">{description}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  )
}

export type CheckboxProps = BaseProps

/** Depth of the checkbox slab. Shallower than a button's — it is a 28pt box. */
const BOX_DEPTH = 3

/** A squared checkbox with a slab, for multi-select lists. */
export function Checkbox({ checked, ...rest }: CheckboxProps) {
  return (
    <ChoiceRow role="checkbox" checked={checked} {...rest}>
      {/* Both states reserve the slab and only the checked one paints it, so
          the box is the same height either way and the row does not shift. */}
      <Squish
        depth={BOX_DEPTH}
        radius={10}
        slabClassName={checked ? 'bg-pandan-slab' : 'bg-transparent'}
        className={cn(
          'h-[28px] w-[28px] items-center justify-center',
          checked ? 'bg-pandan' : 'border-[3px] border-line-strong',
        )}
      >
        {checked ? (
          <Text className="font-display text-[16px] leading-[16px] text-on-pandan">✓</Text>
        ) : null}
      </Squish>
    </ChoiceRow>
  )
}

export type RadioProps = BaseProps

/** A round radio, for one-of-many choices. */
export function Radio({ checked, ...rest }: RadioProps) {
  return (
    <ChoiceRow role="radio" checked={checked} {...rest}>
      <View
        className={cn(
          'h-[28px] w-[28px] items-center justify-center rounded-full border-[3px]',
          checked ? 'border-pandan' : 'border-line-strong',
        )}
        // Matches the space the checkbox reserves for its slab, so a mixed
        // list of radios and checkboxes lines up.
        style={{ marginBottom: BOX_DEPTH }}
      >
        {checked ? <View className="h-[14px] w-[14px] rounded-full bg-pandan" /> : null}
      </View>
    </ChoiceRow>
  )
}

export type RadioGroupProps<T extends string> = {
  options: readonly { value: T; label: string; description?: string }[]
  value: T | null
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
}

/**
 * A set of radios where exactly one wins.
 *
 * Worth having as its own component rather than a map in each caller: a bare
 * list of `Radio`s can be put into a state where none or several are selected,
 * and this cannot.
 */
export function RadioGroup<T extends string>({
  options,
  value,
  onChange,
  disabled,
  className,
}: RadioGroupProps<T>) {
  return (
    <View className={cn('gap-1', className)} accessibilityRole="radiogroup">
      {options.map((option) => (
        <Radio
          key={option.value}
          checked={option.value === value}
          onChange={() => onChange(option.value)}
          label={option.label}
          description={option.description}
          disabled={disabled}
        />
      ))}
    </View>
  )
}
