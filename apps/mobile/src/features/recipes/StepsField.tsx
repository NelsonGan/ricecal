import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type TextInput, View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { Button, cn, Icon, IconButton, Sheet, Tappable, Text, TextField } from '@/ui'
import { RecipeSteps, splitSteps } from './RecipeSteps'

export type StepsFieldProps = {
  value: string
  onChange: (steps: string) => void
}

type DraftStep = { key: string; text: string }

let nextStepKey = 0
const stageStep = (text = ''): DraftStep => ({ key: `step-${nextStepKey++}`, text })
const joinedSteps = (steps: readonly DraftStep[]) =>
  steps
    .map((step) => step.text.trim())
    .filter(Boolean)
    .join('\n')
const oneLine = (text: string) => text.replace(/\s*[\r\n]+\s*/g, ' ')

/**
 * The method: a numbered list at rest, numbered fields while it is being written.
 *
 * The database still receives one newline-delimited string. Rows only exist in
 * this sheet, where they make adding and removing the sequence clear
 * without asking somebody to format the text themselves.
 *
 * A field that shows the finished thing when it is not being used is not a
 * pattern this app had. It earns it because this is the only field whose stored
 * value and rendering differ: a cook who typed four lines into a grey box had no
 * way of knowing they were about to become four numbered steps.
 *
 * The editor is a sheet, which is the shape README.md prescribes for typing and
 * the only one that puts the field at the top of the screen with the keyboard
 * covering nothing but empty panel. It also buys the room the field wanted: six
 * steps in a 120pt box is a two-line window onto a method.
 */
export function StepsField({ value, onChange }: StepsFieldProps) {
  const { t } = useTranslation(['recipes', 'common'])
  const colors = useThemeColors()
  const [editing, setEditing] = useState(false)
  /**
   * The rows under the cursor, held here rather than pushed up on every
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
  const [draft, setDraft] = useState<DraftStep[]>([])
  /** Opening to read and closing again must not mark the whole food as changed. */
  const [changed, setChanged] = useState(false)
  // Presented, so the field may take focus. `autoFocus` inside a `Modal` is
  // applied while the field is still off screen and routinely dropped.
  const [ready, setReady] = useState(false)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const inputs = useRef(new Map<string, TextInput>())

  useEffect(() => {
    if (!ready || !focusKey) return
    const frame = requestAnimationFrame(() => {
      inputs.current.get(focusKey)?.focus()
      setFocusKey(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [focusKey, ready])

  const open = () => {
    const existing = splitSteps(value).map((step) => stageStep(step))
    const rows = existing.length > 0 ? existing : [stageStep()]
    setDraft(rows)
    setChanged(false)
    setFocusKey(rows[0].key)
    setEditing(true)
  }

  const close = () => {
    // Only when it actually changed. `onChange` marks the form dirty, and
    // opening the sheet to read the method and closing it again is not an
    // edit — it would arm the discard confirmation on the way out of a form
    // nobody touched.
    const next = joinedSteps(draft)
    if (changed && next !== value) onChange(next)
    setEditing(false)
    setReady(false)
    setFocusKey(null)
  }

  const addStep = () => {
    const next = stageStep()
    setDraft((current) => [...current, next])
    setChanged(true)
    setFocusKey(next.key)
  }

  const removeStep = (key: string) => {
    const index = draft.findIndex((step) => step.key === key)
    if (index < 0) return

    if (draft.length === 1) {
      setDraft([{ ...draft[0], text: '' }])
      setFocusKey(draft[0].key)
    } else {
      const next = draft.filter((step) => step.key !== key)
      setDraft(next)
      setFocusKey(next[Math.min(index, next.length - 1)].key)
    }
    setChanged(true)
  }

  const updateStep = (key: string, text: string) => {
    setDraft((current) => {
      const next = current.map((step) => (step.key === key ? { ...step, text } : step))
      // The old single field allowed 4,000 characters. Keep the same ceiling
      // across all rows rather than quietly multiplying it by the step count.
      return next.map((step) => step.text).join('\n').length <= 4000 ? next : current
    })
    setChanged(true)
  }

  const steps = splitSteps(value)

  return (
    <View className="gap-1.5">
      <Text variant="label">{t('recipes:edit.steps')}</Text>

      <Tappable
        className={cn(
          steps.length
            ? 'gap-3 rounded-card border-[3px] border-line bg-surface p-4'
            : 'flex-row items-center gap-2.5 py-1',
        )}
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
          <>
            <View className="h-[30px] w-[30px] items-center justify-center rounded-md bg-pandan-soft">
              <Icon set="ui" name="plus" size={16} />
            </View>
            <Text variant="label" className="text-pandan-ink">
              {t('recipes:edit.stepsWrite')}
            </Text>
          </>
        )}
      </Tappable>

      {/* Full height because it contains fields, and scrollable because a real
          method can grow past the keyboard. Done stays in the body rather than
          a footer, which would land behind that keyboard. */}
      <Sheet
        visible={editing}
        onClose={close}
        title={t('recipes:edit.stepsSheetTitle')}
        closeLabel={t('common:action.close')}
        fullHeight
        onShow={() => setReady(true)}
      >
        {editing ? (
          <View className="gap-3">
            {draft.map((step, index) => (
              <View key={step.key} className="flex-row items-start gap-2.5">
                <View className="items-center gap-1 pt-3">
                  <View className="h-[32px] w-[32px] items-center justify-center rounded-full bg-pandan-soft">
                    <Text variant="caption" className="text-pandan-ink">
                      {index + 1}
                    </Text>
                  </View>
                  <IconButton
                    size="sm"
                    variant="neutral"
                    accessibilityLabel={t('recipes:edit.removeStep', { count: index + 1 })}
                    onPress={() => removeStep(step.key)}
                  >
                    <Icon set="ui" name="delete" size={16} tintColor={colors.hibiscusInk} />
                  </IconButton>
                </View>
                <TextField
                  ref={(input) => {
                    if (input) inputs.current.set(step.key, input)
                    else inputs.current.delete(step.key)
                  }}
                  containerClassName="min-w-0 flex-1"
                  value={step.text}
                  // A newline is the stored row delimiter. Keeping it out of a
                  // row means pasted text cannot create steps with no matching
                  // Add action or remove control.
                  onChangeText={(text) => updateStep(step.key, oneLine(text))}
                  placeholder={t('recipes:edit.stepPlaceholder')}
                  accessibilityLabel={t('recipes:edit.stepLabel', { count: index + 1 })}
                  multiline
                  submitBehavior="blurAndSubmit"
                  returnKeyType="done"
                  className="min-h-[88px] items-start py-2"
                  inputClassName="pt-2"
                  textAlignVertical="top"
                />
              </View>
            ))}

            <Tappable
              className="flex-row items-center gap-2.5 py-1"
              onPress={addStep}
              accessibilityRole="button"
              accessibilityLabel={t('recipes:edit.addStep')}
            >
              <View className="h-[30px] w-[30px] items-center justify-center rounded-md bg-pandan-soft">
                <Icon set="ui" name="plus" size={16} />
              </View>
              <Text variant="label" className="text-pandan-ink">
                {t('recipes:edit.addStep')}
              </Text>
            </Tappable>

            <Button fullWidth onPress={close}>
              {t('common:action.done')}
            </Button>
          </View>
        ) : null}
      </Sheet>
    </View>
  )
}
