import { forwardRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextInput } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { Icon, IconButton, TextField, type TextFieldProps } from '@/ui'

export type PasswordFieldProps = Omit<TextFieldProps, 'secureTextEntry' | 'rightSlot'>

/**
 * A password box with an eye on it.
 *
 * The eye is not a nicety on a phone. A password typed on a soft keyboard into
 * a field of dots is the single most mistyped thing in any app, and the failure
 * is silent: the field looks the same whether it says what you meant or not.
 * Both password screens use this, so "show" behaves the same in both, and the
 * confirm box gets one too — a mismatch is exactly the case where seeing the
 * two is the whole answer.
 *
 * `autoComplete` and `textContentType` are the caller's to set, because they
 * are the difference between the keychain offering to save a NEW password and
 * offering to fill an existing one, and only the caller knows which screen this
 * is.
 */
export const PasswordField = forwardRef<TextInput, PasswordFieldProps>(
  function PasswordField(props, ref) {
    const { t } = useTranslation('auth')
    const colors = useThemeColors()
    const [shown, setShown] = useState(false)

    return (
      <TextField
        ref={ref}
        // Off, all of it. Autocorrect on a password field turns a good password
        // into a word, and the platform capitalising the first letter of one is
        // how a password that was right yesterday is wrong today.
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        secureTextEntry={!shown}
        rightSlot={
          <IconButton
            size="sm"
            variant="ghost"
            onPress={() => setShown((was) => !was)}
            accessibilityLabel={t(shown ? 'password.hide' : 'password.show')}
          >
            <Icon
              set="system"
              name={shown ? 'eye-hide' : 'eye-show'}
              size={20}
              tintColor={colors.muted}
            />
          </IconButton>
        }
        {...props}
      />
    )
  },
)
