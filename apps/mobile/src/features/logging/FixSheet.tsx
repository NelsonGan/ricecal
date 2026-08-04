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
 * It also wants the keyboard the instant it opens and nothing else competing
 * for the first tap, which a sheet gives and a card three cards down a
 * scrolling page does not.
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
      /* Full height because this sheet raises the keyboard itself. A capped
         panel is PADDED UP off the bottom edge by `KeyboardAvoidingView`, and
         the strip it leaves behind shows the scrim through the curve of the
         keyboard's top corners — the sheet reads as floating rather than as
         attached to the bottom of the screen. A full-height panel stays where
         it is and the scroll view insets its own content instead, which is what
         the quick selector does when search or describe opens.

         And no `footer`, for the other half of the same problem: a footer is
         outside that scroll view, so at full height it sits at the bottom of
         the panel BEHIND the keyboard. The button goes in the body, under the
         chips, where the inset carries it. */
      fullHeight
      /* Through `header` rather than as the first child, so it stays above the
         body: the scroll-to-first-responder that follows the keyboard would
         otherwise slide it up under the handle and crop it. */
      header={
        <View className="flex-row items-center gap-2">
          <Icon set="system" name="sparkle" size={20} />
          <Text variant="subtitle">{t('logging:detail.fixTitle')}</Text>
        </View>
      }
    >
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

      <Button fullWidth loading={submitting} disabled={submitDisabled} onPress={onSubmit}>
        {submitLabel}
      </Button>
    </Sheet>
  )
}
