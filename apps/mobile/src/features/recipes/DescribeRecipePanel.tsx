import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Button, TextField } from '@/ui'

export type DescribeRecipePanelProps = {
  /** The pot, as typed. Trimmed and non-empty; the host does the reading. */
  onSubmit: (text: string) => void
  autoFocus?: boolean
}

/**
 * Typing the pot instead of photographing it.
 *
 * Not `DescribePanel`, which does the same job for a meal, and the difference is
 * the shape: that one is a compact sheet where the send button has to be inside
 * the field, where this is full height with the whole screen below it, and an
 * arrow crammed into the field's corner reads as clipped. A full-width button is
 * what the sibling panel in this sheet already does.
 *
 * The hint goes through `TextField`'s own `hint` prop rather than a row built
 * beside it, which has to align an icon against a wrapping line.
 */
export function DescribeRecipePanel({ onSubmit, autoFocus = false }: DescribeRecipePanelProps) {
  const { t } = useTranslation(['recipes', 'common'])
  const [text, setText] = useState('')

  const send = () => {
    const described = text.trim()
    if (described) onSubmit(described)
  }

  return (
    <View className="gap-3">
      <TextField
        value={text}
        onChangeText={setText}
        placeholder={t('recipes:new.describePlaceholder')}
        hint={t('recipes:new.describeHint')}
        autoFocus={autoFocus}
        multiline
        // The return key inserts a newline in a multiline field, so it cannot
        // double as send. The button below is the only way out.
        blurOnSubmit={false}
        // Room for a pot with its amounts on it, with the text starting at the
        // top of that room rather than floating in the middle of an empty box.
        className="min-h-[132px] items-start"
        inputClassName="pt-4"
        textAlignVertical="top"
        maxLength={1000}
      />

      <Button fullWidth disabled={!text.trim()} onPress={send}>
        {t('recipes:new.describeAction')}
      </Button>
    </View>
  )
}
