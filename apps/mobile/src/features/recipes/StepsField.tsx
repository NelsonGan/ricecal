import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type TextInputInstance, View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { Button, Card, cn, Icon, Sheet, Tappable, Text, TextField } from '@/ui'
import { FormSection } from './FormSection'
import { splitSteps } from './RecipeSteps'

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
/** How many steps the form shows before "2 more steps". */
const PREVIEW_STEPS = 3

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
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const inputs = useRef(new Map<string, TextInputInstance>())

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
    setFocusKey(null)
    setActiveKey(null)
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
  const shown = steps.slice(0, PREVIEW_STEPS)
  const hidden = steps.length - shown.length

  return (
    <FormSection
      title={t('recipes:edit.steps')}
      meta={steps.length ? t('recipes:edit.stepsCount', { count: steps.length }) : undefined}
      action={
        steps.length ? (
          // The card under it opens the same sheet and is the one a screen
          // reader is given, so this shortcut is hidden from it.
          <Tappable
            className="min-h-[36px] flex-row items-center gap-1.5 px-1"
            hitSlop={6}
            onPress={open}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Icon set="ui" name="edit" size={14} />
            <Text variant="label" className="text-pandan-ink">
              {t('common:action.edit')}
            </Text>
          </Tappable>
        ) : undefined
      }
    >
      {/* The same card as the ingredients above it, so the two parts of the
          recipe read as the same kind of thing. */}
      <Card
        flush
        contentClassName={cn(
          'gap-0',
          steps.length ? 'px-card py-1' : 'flex-row items-center gap-2.5 px-card py-md',
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
            {/* A preview, not the method: the recipe page and cook mode are
                where it is read. In full it pushed Source a screen down. */}
            {shown.map((step, index) => (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: a read-only preview that never reorders
                key={index}
                className={cn(
                  'flex-row items-start gap-3 py-2.5',
                  index > 0 && 'border-line border-t-2',
                )}
              >
                <View className="h-[24px] w-[24px] items-center justify-center rounded-full bg-pandan-soft">
                  <Text variant="caption" className="text-pandan-ink">
                    {index + 1}
                  </Text>
                </View>
                <Text numberOfLines={1} className="min-w-0 flex-1 font-body text-[15px] text-body">
                  {step}
                </Text>
              </View>
            ))}
            {hidden > 0 ? (
              <Text variant="meta" className="border-line border-t-2 py-2.5 pl-9">
                {t('recipes:edit.stepsMore', { count: hidden })}
              </Text>
            ) : null}
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
      </Card>

      {/* Full height because it contains fields, and scrollable because a real
          method can grow past the keyboard. Done stays in the body rather than
          a footer, which would land behind that keyboard. */}
      <Sheet
        visible={editing}
        onClose={close}
        onDismiss={() => setReady(false)}
        title={t('recipes:edit.stepsSheetTitle')}
        closeLabel={t('common:action.close')}
        fullHeight
        onShow={() => setReady(true)}
      >
        <View className="gap-3">
          {draft.map((step, index) => (
            <View
              key={step.key}
              className={cn(
                'overflow-hidden rounded-md border-[3px] bg-surface',
                activeKey === step.key ? 'border-pandan' : 'border-line',
              )}
            >
              <View className="min-h-[42px] flex-row items-center justify-between border-line border-b-2 px-4">
                <Text variant="label" className="text-pandan-ink">
                  {t('recipes:edit.stepLabel', { count: index + 1 })}
                </Text>
                <Tappable
                  className="min-h-[40px] flex-row items-center gap-1.5 px-1"
                  hitSlop={2}
                  accessibilityRole="button"
                  accessibilityLabel={t('recipes:edit.removeStep', { count: index + 1 })}
                  onPress={() => removeStep(step.key)}
                >
                  <Icon set="ui" name="delete" size={14} tintColor={colors.hibiscusInk} />
                  <Text variant="caption" className="text-hibiscus-ink">
                    {t('recipes:ingredient.remove')}
                  </Text>
                </Tappable>
              </View>
              <TextField
                ref={(input) => {
                  if (input) inputs.current.set(step.key, input)
                  else inputs.current.delete(step.key)
                }}
                containerClassName="gap-0"
                value={step.text}
                // A newline is the stored row delimiter. Keeping it out of a
                // row means pasted text cannot create steps with no matching
                // Add action or remove control.
                onChangeText={(text) => updateStep(step.key, oneLine(text))}
                placeholder={t('recipes:edit.stepPlaceholder')}
                accessibilityLabel={t('recipes:edit.stepLabel', { count: index + 1 })}
                onFocus={() => setActiveKey(step.key)}
                onBlur={() => setActiveKey((current) => (current === step.key ? null : current))}
                multiline
                submitBehavior="blurAndSubmit"
                returnKeyType="done"
                className="min-h-[76px] items-start rounded-none border-0 px-4 py-2"
                inputClassName="pt-2"
                textAlignVertical="top"
              />
            </View>
          ))}

          <Tappable
            className="min-h-[50px] flex-row items-center gap-3 rounded-md bg-pandan-soft px-4"
            onPress={addStep}
            accessibilityRole="button"
            accessibilityLabel={t('recipes:edit.addStep')}
          >
            <View className="h-[30px] w-[30px] items-center justify-center rounded-full bg-surface">
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
      </Sheet>
    </FormSection>
  )
}
