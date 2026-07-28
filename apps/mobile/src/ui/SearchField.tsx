import { forwardRef } from 'react'
import { Pressable, type TextInput } from 'react-native'

import { Icon } from './Icon'
import { TextField, type TextFieldProps } from './TextField'

export type SearchFieldProps = Omit<TextFieldProps, 'leftSlot' | 'rightSlot'> & {
  /** Renders a clear affordance whenever there is a value. */
  onClear?: () => void
}

/**
 * A search input with the magnifier and a clear button.
 *
 * Separate from `TextField` rather than a `variant` prop because it also
 * carries the right keyboard behaviour: no autocorrect or autocapitalisation,
 * and a "search" return key. Food names are half Malay, and autocorrect turns
 * "kuey teow" into something else entirely.
 */
export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  { onClear, value, placeholder = 'Search food, roti canai', ...rest },
  ref,
) {
  return (
    <TextField
      ref={ref}
      value={value}
      placeholder={placeholder}
      autoCorrect={false}
      autoCapitalize="none"
      returnKeyType="search"
      clearButtonMode="never"
      leftSlot={<Icon set="ui" name="search" size={22} />}
      rightSlot={
        value && onClear ? (
          <Pressable
            onPress={onClear}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Icon set="ui" name="close" size={20} />
          </Pressable>
        ) : null
      }
      {...rest}
    />
  )
})
