import { forwardRef, type ReactNode, useCallback, useState } from 'react'
import { TextInput, type TextInputProps, View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { useNumpadField } from './Numpad'
import { Text } from './Text'

/**
 * The keyboard types that mean "a number", and so get the app's own pad
 * instead of the system one. Everything else is left alone: an email field
 * still wants the platform's keyboard, autocorrect and all.
 */
const NUMERIC = new Set<TextInputProps['keyboardType']>(['number-pad', 'decimal-pad', 'numeric'])

export type TextFieldProps = Omit<TextInputProps, 'style' | 'className'> & {
  label?: string
  /**
   * A control on the label's line, pushed to the right edge of the field.
   *
   * For the action that belongs TO a field rather than after it: "Forgot your
   * password?" over the password box. Under the field it competes with the
   * primary button and reads as one more thing to get past; level with the
   * label it reads as a property of the thing it is about, which is where every
   * sign-in form anybody has used puts it.
   */
  labelAction?: ReactNode
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
  /**
   * Keep the PLATFORM's keyboard on a field whose `keyboardType` is numeric.
   *
   * The default is the app's own pad, for the reason README.md gives about iOS
   * 26's floating "Done" pill, and it is right for every figure the app asks
   * for: a weight, a portion, a calorie total. It is wrong for a code.
   *
   * A pad that types a NUMBER cannot type a six digit STRING. It drops a
   * leading zero ("0" then "7" gives "7", because `07` is a typo in every
   * quantity this app holds), and one in six codes starts with one. It also
   * takes away the keyboard, and the keyboard is what carries `oneTimeCode`
   * autofill — the whole reason a code arriving by mail can be filled in with
   * one tap rather than memorised.
   */
  systemKeyboard?: boolean
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
    labelAction,
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
    value,
    onChangeText,
    keyboardType,
    selectTextOnFocus,
    // Read here rather than left in `rest` because the PAD has to honour it
    // too: with the system keyboard suppressed, a limit only the `TextInput`
    // knows about is a limit nothing enforces. Still forwarded below, so a
    // field on the platform's keyboard behaves the same way.
    maxLength,
    systemKeyboard = false,
    secureTextEntry,
    placeholder,
    ...rest
  },
  ref,
) {
  const colors = useThemeColors()
  const [focused, setFocused] = useState(false)

  /**
   * A numeric field is driven by the app's own pad, and the label it already
   * has is what the pad puts in its header — the field is often under the pad
   * by the time it opens, and "1 2 3" over nothing says which number is being
   * typed to nobody.
   *
   * `selectTextOnFocus` carries across as `replaceFirst`. With no keyboard
   * there is no typing to replace a selection, so the pad reproduces what the
   * prop was actually for: the first key stands in for the whole value.
   *
   * Unless the caller asked for the platform's keyboard. See `systemKeyboard`.
   */
  const numpad = useNumpadField({
    // `onChangeText` is part of it because the pad has nowhere to write without
    // one. An uncontrolled numeric field is not a shape this app uses, and if
    // one appears it should fall back to the platform's keyboard rather than
    // open a pad whose keys do nothing.
    enabled: editable && !systemKeyboard && NUMERIC.has(keyboardType) && Boolean(onChangeText),
    value: value ?? '',
    onChangeText: onChangeText ?? (() => {}),
    decimal: keyboardType !== 'number-pad',
    label,
    maxLength,
    replaceFirst: Boolean(selectTextOnFocus),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  })

  // The pad owns a ref of its own so it can blur and measure the field. A
  // caller's ref still has to reach the same node — the gallery focuses one
  // field from another's return key — so both are set from one callback.
  const setRef = useCallback(
    (node: TextInput | null) => {
      numpad.ref.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref, numpad.ref],
  )

  // Error outranks focus: a field you are typing into that is invalid should
  // read as invalid, not as merely active.
  const border = error ? 'border-hibiscus' : focused ? 'border-pandan' : 'border-line'

  /**
   * A secure field draws its own placeholder, because iOS restyles the native one
   * and no prop stops it. Once the keychain has a credential to offer, iOS treats
   * a `password` field as an AutoFill target and renders its placeholder with its
   * own tracking, so "At least 8 characters" comes out spaced and truncated on
   * the first such field only. It is invisible on a simulator with no saved
   * passwords.
   *
   * So a secure field passes no `placeholder` and lays the text over the input
   * instead, in the app's own type. The overlay takes no touches, so the tap
   * still lands on the field.
   *
   * Only while the value is empty, and only for a secure field.
   */
  const ownPlaceholder = Boolean(secureTextEntry) && !value && Boolean(placeholder)

  return (
    <View className={cn('gap-1.5', containerClassName)}>
      {/* One row when there is an action, so the label and it share a baseline
          rather than the action opening a line of its own. `min-w-0` on the
          label so a long one truncates instead of pushing the action off. */}
      {label || labelAction ? (
        <View className="min-h-[20px] flex-row items-center justify-between gap-3">
          <Text variant="label" numberOfLines={1} className="min-w-0 shrink">
            {label}
          </Text>
          {labelAction}
        </View>
      ) : null}

      <View
        className={cn(
          'min-h-[60px] flex-row items-center gap-3 rounded-md border-[3px] bg-surface px-5',
          border,
          !editable && 'opacity-60',
          className,
        )}
      >
        {leftSlot}
        <View className="flex-1 justify-center">
          {ownPlaceholder ? (
            <Text
              pointerEvents="none"
              numberOfLines={1}
              className="absolute font-body-bold text-[17px] text-faint"
            >
              {placeholder}
            </Text>
          ) : null}
          <TextInput
            editable={editable}
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType}
            maxLength={maxLength}
            secureTextEntry={secureTextEntry}
            placeholder={ownPlaceholder ? undefined : placeholder}
            selectTextOnFocus={selectTextOnFocus}
            className={cn('font-body-bold text-[17px] text-ink', inputClassName)}
            placeholderTextColor={colors.faint}
            // The caret defaults to the platform blue, which is the one colour
            // in the app that belongs to no role.
            cursorColor={colors.pandan}
            selectionColor={colors.pandan}
            accessibilityLabel={label}
            {...rest}
            // Last, and the ordering is load-bearing: the pad composes the focus
            // handlers this field wants with the ones a caller passed in, and its
            // pair has to be the one that reaches the input.
            {...numpad}
            ref={setRef}
            onFocus={(event) => {
              numpad.onFocus()
              onFocus?.(event)
            }}
            onBlur={(event) => {
              numpad.onBlur()
              onBlur?.(event)
            }}
          />
        </View>
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
