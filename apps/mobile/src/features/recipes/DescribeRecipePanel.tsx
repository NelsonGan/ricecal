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
 * NOT `DescribePanel`, which does the same job for a MEAL, and the difference
 * is the shape rather than the words. That one lives in a compact sheet where
 * the send button has to be inside the field because there is nowhere else for
 * it; this one is in a full-height sheet with the whole screen below the field,
 * and an arrow crammed into the field's bottom corner there reads as clipped
 * rather than as an action. A full-width button under the field is what the
 * sibling panel in this same sheet already does — see `IngredientSheet`'s
 * custom ingredient — and it is what README.md prescribes for a sheet at full
 * height.
 *
 * The hint goes through `TextField`'s own `hint` prop rather than a row built
 * beside it. A hand-built row has to align an icon against a wrapping line, and
 * it was the thing that looked crooked.
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
