import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, type TextInput, View } from 'react-native'

import { Button, Chip, Icon, Sheet, Text, TextField } from '@/ui'

export type FixSheetProps = {
  visible: boolean
  onClose: () => void
  /** What is being written. Shared with the chips, which fill the field in. */
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  /** Offered under the field. What people most often vary about this dish. */
  suggestions?: readonly string[]
  /**
   * A chip was tapped. Its own prop rather than `onChangeText(text)` because a
   * suggestion can mean more than its words — "Half portion" is a serving as
   * well as a note, and only the screen knows that.
   */
  onPickSuggestion: (text: string) => void
  onSubmit: () => void
  submitLabel: string
  submitDisabled?: boolean
  submitting?: boolean
  /** The keyboard's own submit key. "Send" dispatches; "Done" only closes. */
  returnKey?: 'send' | 'done'
}

/**
 * FIX IT, in a sheet of its own.
 *
 * The detail screen is a form now — every control on it stages an edit that
 * Save writes — and a free-text correction is not one of those: for a scanned
 * plate it goes to the server, comes back as a different meal, and leaves the
 * screen behind. Sitting in a card among the staged controls it read as one
 * more field waiting for the same button.
 *
 * It also wants the keyboard the instant it opens, which is the other reason it
 * is a sheet: the field is the only thing in it, so there is nothing to scroll
 * past and nowhere else for a first tap to go.
 */
export function FixSheet({
  visible,
  onClose,
  value,
  onChangeText,
  placeholder,
  suggestions,
  onPickSuggestion,
  onSubmit,
  submitLabel,
  submitDisabled = false,
  submitting = false,
  returnKey = 'send',
}: FixSheetProps) {
  const { t } = useTranslation(['logging', 'common'])
  const field = useRef<TextInput>(null)

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      // See `onShow` on `Sheet`: `autoFocus` inside a window that has not been
      // presented yet is dropped, and the sheet then opens over no keyboard.
      onShow={() => field.current?.focus()}
      // Nothing here is long enough to scroll, and a scroll view between the
      // field and the keyboard is one more thing to fight over the first tap.
      scrollable={false}
      footer={
        <Button fullWidth loading={submitting} disabled={submitDisabled} onPress={onSubmit}>
          {submitLabel}
        </Button>
      }
    >
      <View className="flex-row items-center gap-2">
        <Icon set="system" name="sparkle" size={20} />
        <Text variant="subtitle">{t('logging:detail.fixTitle')}</Text>
      </View>

      <TextField
        ref={field}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        returnKeyType={returnKey}
        onSubmitEditing={submitDisabled ? undefined : onSubmit}
        accessibilityLabel={t('logging:detail.fixTitle')}
      />

      {suggestions?.length ? (
        // One line that scrolls, rather than wrapping to two. Three chips of
        // unpredictable length were rearranging the height as the model's
        // suggestions changed. Bled past the sheet's own padding on both sides,
        // so a chip that runs off the screen is cut by the screen rather than
        // stopping short of it behind a strip of surface.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-gutter"
          contentContainerClassName="flex-row gap-2 px-gutter"
          keyboardShouldPersistTaps="handled"
        >
          {suggestions.map((suggestion) => (
            <Chip
              key={suggestion}
              selected={value === suggestion}
              onPress={() => onPickSuggestion(suggestion)}
            >
              {suggestion}
            </Chip>
          ))}
        </ScrollView>
      ) : null}
    </Sheet>
  )
}
