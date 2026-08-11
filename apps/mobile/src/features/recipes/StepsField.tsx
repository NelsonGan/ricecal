import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Button, Icon, Sheet, Tappable, Text, TextField } from '@/ui'
import { RecipeSteps, splitSteps } from './RecipeSteps'

export type StepsFieldProps = {
  value: string
  onChange: (steps: string) => void
}

/**
 * The method: a numbered list at rest, a plain box while it is being written.
 *
 * The two are the same string. `RecipeSteps` numbers what `splitSteps` finds,
 * and the numerals are drawn rather than stored — so what the cook edits is
 * always the text they typed, and taking a step out of the middle renumbers the
 * rest by itself. See the note on `RecipeSteps`.
 *
 * A form field that shows the FINISHED thing when it is not being used is not a
 * pattern this app had, and it earns it here for one reason: this is the only
 * field whose stored value and whose rendering differ. A name is a name. Steps
 * are a paragraph in the column and a list on every screen that reads them, and
 * a cook who typed four lines into a grey box had no way of knowing they were
 * about to become four numbered steps until they saved and left.
 *
 * THE EDITOR IS A SHEET, and that is not decoration. A multiline field at the
 * bottom of a long form was the case the screen shell handled worst: the box
 * stayed under the keyboard however many times it was tapped, because two
 * mechanisms were insetting for one keyboard and each undid the other's work.
 * `Screen` has one owner now and the reveal is reliable, but the sheet stays:
 * it is the shape CLAUDE.md prescribes for a sheet with typing in it, the same
 * one the describe panel and the fix sheet use, and it is the only one that
 * puts the field at the TOP of the screen with the keyboard covering nothing
 * but empty panel below it.
 *
 * It also buys the room the field always wanted. Six steps in a 120pt box is a
 * two-line window onto a method.
 */
export function StepsField({ value, onChange }: StepsFieldProps) {
  const { t } = useTranslation(['recipes', 'common'])
  const [editing, setEditing] = useState(false)
  /**
   * The text under the cursor, held here rather than pushed up on every
   * keystroke — but EVERY way out of the sheet commits it, including the
   * handle and the scrim.
   *
   * Discarding on dismissal was the first shape and it is a trap: six lines of
   * method typed into a full-height sheet, a reflexive tap on the handle, and
   * the lot is gone with nothing asked. It also disagrees with every other
   * field on this form, all of which go straight into form state as they are
   * typed. The form is what guards against losing work, through the discard
   * confirmation on its own back control, and staging it twice only creates a
   * second place to lose it.
   */
  const [draft, setDraft] = useState('')
  // Presented, so the field may take focus. `autoFocus` inside a `Modal` is
  // applied while the field is still off screen and routinely dropped.
  const [ready, setReady] = useState(false)

  const open = () => {
    setDraft(value)
    setEditing(true)
  }

  const close = () => {
    // Only when it actually changed. `onChange` marks the form dirty, and
    // opening the sheet to read the method and closing it again is not an
    // edit — it would arm the discard confirmation on the way out of a form
    // nobody touched.
    if (draft !== value) onChange(draft)
    setEditing(false)
    setReady(false)
  }

  const steps = splitSteps(value)

  return (
    <View className="gap-1.5">
      <Text variant="label">{t('recipes:edit.steps')}</Text>

      <Tappable
        className="gap-3 rounded-card border-[3px] border-line bg-surface p-4"
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={
          steps.length
            ? t('recipes:edit.stepsEdit', { count: steps.length })
            : t('recipes:edit.stepsWrite')
        }
      >
        {steps.length ? (
          <>
            <RecipeSteps steps={value} />
            {/* The affordance, because a numbered list looks like a finished
                thing rather than a control. A pencil and a word are what say
                the list is still a field. */}
            <View className="flex-row items-center gap-2">
              <Icon set="ui" name="edit" size={16} />
              <Text variant="label" className="text-pandan-ink">
                {t('recipes:edit.stepsEditAction')}
              </Text>
            </View>
          </>
        ) : (
          // Empty, and it has to read as a box that wants filling in rather
          // than as a card with nothing in it.
          <View className="gap-1">
            <Text variant="body" className="text-muted">
              {t('recipes:edit.stepsPlaceholder')}
            </Text>
            <Text variant="meta">{t('recipes:edit.stepsHint')}</Text>
          </View>
        )}
      </Tappable>

      {/* A text field, so full height and not scrollable — the two rules a
          sheet with typing in it always follows. See CLAUDE.md. No footer
          either: at full height a footer lands behind the keyboard, so Done
          goes in the body under the field. */}
      <Sheet
        visible={editing}
        onClose={close}
        title={t('recipes:edit.stepsSheetTitle')}
        closeLabel={t('common:action.close')}
        fullHeight
        scrollable={false}
        onShow={() => setReady(true)}
      >
        {ready ? (
          <View className="gap-3">
            <TextField
              value={draft}
              onChangeText={setDraft}
              placeholder={t('recipes:edit.stepsPlaceholder')}
              hint={t('recipes:edit.stepsHint')}
              autoFocus
              multiline
              // Return inserts a newline here, and a newline is the whole
              // point of this field — it is what makes the next step. So it
              // cannot double as submit; the button below is the way out.
              blurOnSubmit={false}
              className="min-h-[220px] items-start"
              inputClassName="pt-4"
              textAlignVertical="top"
              maxLength={4000}
            />

            {/* The way out that reads as one. The handle and the scrim commit
                the same text; this is the one a cook who has finished writing
                will actually look for. */}
            <Button fullWidth onPress={close}>
              {t('common:action.done')}
            </Button>
          </View>
        ) : null}
      </Sheet>
    </View>
  )
}
