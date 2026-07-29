import { forwardRef, type ReactNode, useCallback, useState } from 'react'
import { TextInput, type TextInputProps, View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { Text } from './Text'

export type TextFieldProps = Omit<TextInputProps, 'style' | 'className'> & {
  label?: string
  /** Shown under the field, in hibiscus, and flips the border. */
  error?: string
  /** Shown under the field when there is no error. */
  hint?: string
  leftSlot?: ReactNode
  rightSlot?: ReactNode
  /** The bordered box. Layout and sizing of the field itself. */
  className?: string
  /** The `TextInput` inside it — for a field whose value wants display type. */
  inputClassName?: string
  containerClassName?: string
}

/**
 * A single-line input.
 *
 * Forwards its ref so form libraries can focus it and so a multi-field form can
 * chain `returnKeyType="next"` from one input to the next — the difference
 * between a form you can fill with your thumbs and one you cannot.
 *
 * Focus state lives here rather than in a caller because the focus ring is part
 * of the field, and every consumer would otherwise reimplement the same two
 * handlers and forget to call through to the ones passed in.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    error,
    hint,
    leftSlot,
    rightSlot,
    className,
    inputClassName,
    containerClassName,
    onFocus,
    onBlur,
    editable = true,
    ...rest
  },
  ref,
) {
  const colors = useThemeColors()
  const [focused, setFocused] = useState(false)

  const handleFocus = useCallback<NonNullable<TextInputProps['onFocus']>>(
    (event) => {
      setFocused(true)
      onFocus?.(event)
    },
    [onFocus],
  )

  const handleBlur = useCallback<NonNullable<TextInputProps['onBlur']>>(
    (event) => {
      setFocused(false)
      onBlur?.(event)
    },
    [onBlur],
  )

  // Error outranks focus: a field you are typing into that is invalid should
  // read as invalid, not as merely active.
  const border = error ? 'border-hibiscus' : focused ? 'border-pandan' : 'border-line'

  return (
    <View className={cn('gap-1.5', containerClassName)}>
      {label ? <Text variant="label">{label}</Text> : null}

      <View
        className={cn(
          'min-h-[60px] flex-row items-center gap-3 rounded-md border-[3px] bg-surface px-5',
          border,
          !editable && 'opacity-60',
          className,
        )}
      >
        {leftSlot}
        <TextInput
          ref={ref}
          editable={editable}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={cn('flex-1 font-body-bold text-[17px] text-ink', inputClassName)}
          placeholderTextColor={colors.faint}
          // The caret defaults to the platform blue, which is the one colour in
          // the app that belongs to no role.
          cursorColor={colors.pandan}
          selectionColor={colors.pandan}
          accessibilityLabel={label}
          {...rest}
        />
        {rightSlot}
      </View>

      {error ? (
        <Text variant="label" className="pl-1.5 text-hibiscus-ink">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="meta" className="pl-1.5">
          {hint}
        </Text>
      ) : null}
    </View>
  )
})
