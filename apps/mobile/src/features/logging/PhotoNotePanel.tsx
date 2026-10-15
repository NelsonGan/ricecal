import { Image } from 'expo-image'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, View } from 'react-native'
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { photoCropFill } from '@/lib/photo'
import { Button, Chip, Icon, sheetBottomPadding, Tappable, Text, TextField } from '@/ui'

/**
 * The one-tap additions under the field. What a photo is worst at, in the order
 * people reach for them: how much of the plate was theirs, then what the camera
 * cannot see in it. Keys rather than strings, so each language says its own.
 */
const SUGGESTIONS = ['shared', 'half', 'lessRice', 'noSugar'] as const

/** Between the buttons and the top of the keyboard. */
const KEYBOARD_GAP = 12

/** A note qualifies a photo rather than replacing it, so it is short. */
export const PHOTO_NOTE_MAX = 300

export type PhotoNotePanelProps = {
  /** The shot just taken. Undefined on a device with no camera. */
  photoUri: string | undefined
  /** Log the photo with these words, or with none when they are empty. */
  onLog: (note: string) => void
  /** Log the photo on its own, whatever has been typed. */
  onSkip: () => void
  /** Back to the viewfinder, dropping this shot. */
  onRetake: () => void
}

/**
 * The step between the shutter and the scan: a few words about what the photo
 * cannot show. Which curry it is, what is in the cup, that half the plate was
 * somebody else's. The model reads them beside the picture.
 *
 * In the same sheet as the camera, in the space the feed had, with the keyboard
 * already up: a step that asks for a tap before it asks for words is a step
 * people skip. Skip is always there and logs the photo exactly as the shutter
 * used to.
 *
 * The photo takes whatever height the keyboard leaves. Everything under it is
 * fixed, so on a small phone the picture shrinks rather than the buttons
 * dropping behind the keys.
 */
export function PhotoNotePanel({ photoUri, onLog, onSkip, onRetake }: PhotoNotePanelProps) {
  const { t } = useTranslation(['logging', 'common'])
  const [note, setNote] = useState('')

  /** A chip adds its words to what is there rather than replacing it. */
  const add = (words: string) =>
    setNote((current) => {
      const trimmed = current.trim()
      if (!trimmed) return words
      if (trimmed.toLowerCase().includes(words.toLowerCase())) return current
      const next = `${trimmed.replace(/[,;]\s*$/, '')}, ${words}`
      // Whole or not at all: cut to fit, a chip reached the model as half a word.
      return next.length > PHOTO_NOTE_MAX ? current : next
    })

  /**
   * Once. Each of these starts a scan, and the sheet takes a frame or two to go
   * after one does: a double tap, or the return key and the button together,
   * would log the plate twice and spend two scans on it. A ref, so the second
   * press in the same frame sees the first.
   */
  const done = useRef(false)
  const once = (finish: () => void) => () => {
    if (done.current) return
    done.current = true
    finish()
  }
  const log = once(() => onLog(note.trim()))
  const skip = once(onSkip)

  /**
   * Out of the keyboard's way, by the keyboard's own height on the UI thread.
   *
   * Not `KeyboardAvoidingView`, which did nothing here: it measures its frame
   * against its parent, and inside a sheet that has slid up from the bottom
   * that frame is nowhere near the keyboard, so it computed no overlap and the
   * buttons sat behind the keys. Less the sheet's own bottom padding, which
   * the keyboard covers anyway, plus a gap so the button's slab does not sit
   * on the keys, and never negative: with no keyboard the sheet pads itself.
   */
  const keyboard = useReanimatedKeyboardAnimation()
  const sheetPadding = sheetBottomPadding(useSafeAreaInsets().bottom)
  const clear = useAnimatedStyle(() => ({
    paddingBottom: Math.max(-keyboard.height.value - sheetPadding + KEYBOARD_GAP, 0),
  }))

  return (
    <Animated.View style={[{ flex: 1 }, clear]}>
      <View className="flex-1 gap-3">
        <View className="min-h-[56px] flex-1 items-center justify-center overflow-hidden rounded-tile bg-inverse">
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              // The same crop the viewfinder showed, so the plate looks the way
              // it was framed. See `PHOTO_CROP`.
              style={photoCropFill}
              contentFit="cover"
              accessibilityLabel={t('logging:photoNote.photo')}
            />
          ) : (
            <Icon set="food" name="empty-plate" size={72} />
          )}
          <Tappable
            className="absolute right-2.5 bottom-2.5 flex-row items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5"
            onPress={onRetake}
            accessibilityRole="button"
            accessibilityLabel={t('logging:photoNote.retake')}
            hitSlop={8}
          >
            <Icon set="ui" name="refresh" size={14} tintColor="#FFFFFF" />
            <Text variant="caption" className="text-white">
              {t('logging:photoNote.retake')}
            </Text>
          </Tappable>
        </View>

        {/* Closer to its field than the rest of the stack is spaced: the title
            names the field, so the two read as one control. */}
        <View className="gap-1.5">
          <Text variant="subtitle">{t('logging:photoNote.title')}</Text>

          <TextField
            value={note}
            onChangeText={setNote}
            placeholder={t('logging:photoNote.placeholder')}
            accessibilityLabel={t('logging:photoNote.title')}
            // Up with the step, not a tap later: the whole point of asking here
            // is that the thumb is already on the screen.
            autoFocus
            multiline
            // Return logs. A note is a line, and making somebody reach past the
            // keyboard for the button is the slow way to say "that's it".
            submitBehavior="submit"
            returnKeyType="done"
            onSubmitEditing={log}
            maxLength={PHOTO_NOTE_MAX}
            className="max-h-[96px] min-h-[52px]"
          />
        </View>

        {/* One line that scrolls, like the fix sheet's suggestions, so a long
            translation runs off the edge rather than wrapping the row under
            the keyboard. Bled to the sheet's edges for the same reason. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-gutter grow-0"
          contentContainerClassName="flex-row gap-2 px-gutter"
          keyboardShouldPersistTaps="handled"
        >
          {SUGGESTIONS.map((key) => {
            const words = t(`logging:photoNote.suggestion.${key}`)
            return (
              <Chip key={key} onPress={() => add(words)}>
                {words}
              </Chip>
            )
          })}
        </ScrollView>

        <View className="flex-row items-center gap-3">
          <Button variant="ghost" onPress={skip} contentClassName="px-5">
            {t('logging:photoNote.skip')}
          </Button>
          <Button className="flex-1" onPress={log}>
            {t('logging:photoNote.log')}
          </Button>
        </View>
      </View>
    </Animated.View>
  )
}
