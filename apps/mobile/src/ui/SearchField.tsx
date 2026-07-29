import { forwardRef } from 'react'
import { Pressable, type TextInput } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { Icon } from './Icon'
import { TextField, type TextFieldProps } from './TextField'

export type SearchFieldProps = Omit<TextFieldProps, 'leftSlot' | 'rightSlot'> & {
  /** Renders a clear affordance whenever there is a value. */
  onClear?: () => void
  /** Screen-reader name for that affordance. Pass translated copy. */
  clearLabel?: string
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
  { onClear, clearLabel = 'Clear search', value, placeholder, ...rest },
  ref,
) {
  const colors = useThemeColors()

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
            accessibilityLabel={clearLabel}
          >
            {/* Chrome, so it takes the chrome colour rather than the
                illustration's own red. */}
            <Icon set="ui" name="close" size={20} tintColor={colors.faint} />
          </Pressable>
        ) : null
      }
      {...rest}
    />
  )
})
