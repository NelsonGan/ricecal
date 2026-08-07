import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { Icon, IconButton, Text, TextField } from '@/ui'

export type DescribePanelProps = {
  /** The meal, as typed. Trimmed and non-empty; the host does the logging. */
  onSubmit: (text: string) => void
  autoFocus?: boolean
}

/**
 * Typing the meal, inside the sheet the user opened it from.
 *
 * The third way to log, and the one that covers what the other two cannot: a
 * plate already eaten, a meal in a dark restaurant, a drink nobody photographs,
 * and anything the catalogue has no single row for. Search asks the user to
 * find a name the database already knows; this asks them to say what they ate.
 *
 * MULTILINE, AND THAT IS THE POINT. A meal is "nasi lemak with fried chicken
 * and a teh tarik", and a one-line box that scrolls sideways teaches people to
 * type "nasi lemak" and stop — which logs a third of a lunch. Three lines of
 * room, an example in the placeholder that is a whole meal with a drink on the
 * end, and a hint that says amounts are worth typing.
 *
 * The send button is inside the field and the sheet closes on it, the same
 * shape as the fix-by-typing box on a scanned entry: the wait belongs on the
 * row on Today, not on a spinner in a sheet the user is finished with.
 */
export function DescribePanel({ onSubmit, autoFocus = false }: DescribePanelProps) {
  const { t } = useTranslation(['logging', 'common'])
  const colors = useThemeColors()
  const [text, setText] = useState('')

  const send = () => {
    const meal = text.trim()
    if (!meal) return
    onSubmit(meal)
  }

  return (
    <View className="gap-2">
      <TextField
        value={text}
        onChangeText={setText}
        placeholder={t('logging:describe.placeholder')}
        autoFocus={autoFocus}
        multiline
        // The keyboard's return key inserts a newline in a multiline field, so
        // it cannot double as send — the button is the only way, which is why
        // it is inside the box where the thumb already is.
        blurOnSubmit={false}
        // Room for a meal with its sides on it, and the text starts at the top
        // of that room rather than floating in the middle of an empty box.
        //
        // The box is `items-start`, so the input sits flush against the border
        // and the first line reads as pinned to it. The padding is on the INPUT
        // rather than on the box: the send button is `self-end`, and padding the
        // box would push it off the bottom of the same 92pt.
        className="min-h-[92px] items-start pr-2"
        inputClassName="pt-4"
        textAlignVertical="top"
        maxLength={500}
        rightSlot={
          <IconButton
            size="sm"
            variant="primary"
            className="self-end"
            accessibilityLabel={t('logging:describe.send')}
            disabled={!text.trim()}
            onPress={send}
          >
            <Icon set="ui" name="arrow-up" size={20} tintColor={colors.onPandan} />
          </IconButton>
        }
      />
      <View className="flex-row items-start gap-2 px-1">
        <Icon set="system" name="sparkle" size={16} />
        <Text variant="meta" className="flex-1">
          {t('logging:describe.hint')}
        </Text>
      </View>
    </View>
  )
}
