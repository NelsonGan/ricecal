import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Button, TextField } from '@/ui'

export type DescribePanelProps = {
  /** The meal, as typed. Trimmed and non-empty; the host does the logging. */
  onSubmit: (text: string) => void
  autoFocus?: boolean
}

/**
 * Typing the meal, inside the sheet the user opened it from.
 *
 * The third way to log, covering what the other two cannot: a plate already
 * eaten, a dark restaurant, a drink nobody photographs, anything the catalogue
 * has no single row for. Search asks for a name the database knows; this asks
 * what they ate.
 *
 * Multiline, because a meal is "nasi lemak with fried chicken and a teh tarik"
 * and a one-line box teaches people to type "nasi lemak" and stop. Three lines of
 * room, and a placeholder that is a whole meal with a drink on the end.
 *
 * The placeholder is the only instruction: a hint line under the field said the
 * same thing in the abstract.
 *
 * The sheet closes on send, and the wait belongs on the row on Today.
 */
export function DescribePanel({ onSubmit, autoFocus = false }: DescribePanelProps) {
  const { t } = useTranslation(['logging', 'common'])
  const [text, setText] = useState('')

  const send = () => {
    const meal = text.trim()
    if (!meal) return
    onSubmit(meal)
  }

  return (
    <View className="gap-3">
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
        // and the first line reads as pinned to it. The whole 92pt is the
        // text's now that the button has moved out from the corner.
        className="min-h-[92px] items-start"
        inputClassName="pt-4"
        textAlignVertical="top"
        maxLength={500}
      />

      <Button fullWidth disabled={!text.trim()} onPress={send}>
        {t('logging:describe.send')}
      </Button>
    </View>
  )
}
