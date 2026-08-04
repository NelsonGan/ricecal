import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, type TextInput, View } from 'react-native'

import { Button, Chip, Icon, Sheet, Text, TextField } from '@/ui'

export type FixSheetProps = {
  visible: boolean
  onClose: () => void
  /** The correction being written. Shared with the chips, which fill it in. */
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  /** Offered under the field. What people most often vary about this dish. */
  suggestions?: readonly string[]
  onSubmit: () => void
  /** The correction is on its way to the server. Blocks a second send. */
  submitting?: boolean
}

/**
 * FIX IT — describe what the scan got wrong and let the model correct it.
 *
 * This is the AI path, and the only thing in it. The words go to `scan-refine`,
 * which rescales the portion, edits one part of the plate, or re-resolves the
 * dish through the same cascade the scan used. That is true of a hand-logged
 * entry as much as a photographed one: the function reads `scan_id` as optional
 * throughout, so there is one behaviour here and not two. There was briefly a
 * second variant that saved the text as a note on the row, and it was a
 * different feature wearing this one's clothes.
 *
 * It is a sheet rather than a card on the detail screen because it is not one
 * of that screen's staged edits: the correction leaves for the server, comes
 * back as a different meal, and takes the screen with it. It also wants the
 * keyboard the instant it opens and nothing else competing for the first tap.
 */
export function FixSheet({
  visible,
  onClose,
  value,
  onChangeText,
  placeholder,
  suggestions,
  onSubmit,
  submitting = false,
}: FixSheetProps) {
  const { t } = useTranslation(['logging', 'common'])
  const field = useRef<TextInput>(null)
  const ready = Boolean(value.trim()) && !submitting

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
         attached to the bottom of the screen. Full height stays put and lets
         the keyboard cover the empty part of it. */
      fullHeight
      /* And NOT scrollable, which is the other half of the same decision.
         A scroll view scrolls itself to reveal the first responder when the
         keyboard opens, and on the first open — before the keyboard's real
         height is known — it overshoots and carries the field off the top of
         the panel. There is nothing here worth scrolling: the content is four
         short rows at the top of a full-height sheet, and the keyboard covers
         the space below them. No scroll view, no scroll to get wrong. */
      scrollable={false}
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
        returnKeyType="send"
        onSubmitEditing={ready ? onSubmit : undefined}
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
              onPress={() => onChangeText(suggestion)}
            >
              {suggestion}
            </Chip>
          ))}
        </ScrollView>
      ) : null}

      {/* The same words as the button that opened this, deliberately: the sheet
          is that button's second half, not a new question. */}
      <Button fullWidth loading={submitting} disabled={!ready} onPress={onSubmit}>
        {t('logging:detail.fixAction')}
      </Button>
    </Sheet>
  )
}
