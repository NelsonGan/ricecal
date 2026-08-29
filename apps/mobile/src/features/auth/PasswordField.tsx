import { forwardRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextInput } from 'react-native'

import { Icon, IconButton, TextField, type TextFieldProps } from '@/ui'

export type PasswordFieldProps = Omit<TextFieldProps, 'secureTextEntry' | 'rightSlot'>

/**
 * A password box with an eye on it.
 *
 * A password typed on a soft keyboard into a field of dots is the most mistyped
 * thing in any app, and the failure is silent. Both password screens use this, so
 * "show" behaves the same in both, and the confirm box gets one too: a mismatch
 * is the case where seeing the two is the whole answer.
 *
 * `autoComplete` and `textContentType` are the caller's to set, since they are
 * the difference between the keychain offering to save a new password and
 * offering to fill an existing one.
 */
export const PasswordField = forwardRef<TextInput, PasswordFieldProps>(
  function PasswordField(props, ref) {
    const { t } = useTranslation('auth')
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
            /**
             * `self-center`, because `IconButton` puts `self-start` on its own
             * container and align-self beats the row's `items-center`; left alone
             * the eye sits against the top of a 60pt field.
             *
             * And pulled right, because a 44pt tap target centres its 22pt icon
             * 22pt from its own edge and the field pads 20pt more, so an
             * untouched eye floats 42pt in from the border. The negative margin
             * spends the field's padding, not the tap target, which stays 44pt.
             */
            className="-mr-3 self-center"
            onPress={() => setShown((was) => !was)}
            accessibilityLabel={t(shown ? 'password.hide' : 'password.show')}
          >
            {/* NOT TINTED. These are flat colour illustrations rather than
                glyphs, so a `tintColor` does not recolour the eye, it flattens
                the whole drawing to one solid shape — a black blob on the end
                of the field where an eye should be. The set's own palette is
                what makes it read as an eye at 22pt. */}
            <Icon set="system" name={shown ? 'eye-hide' : 'eye-show'} size={22} />
          </IconButton>
        }
        {...props}
      />
    )
  },
)
