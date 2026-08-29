import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Macros } from '@/data'
import { Button, Sheet, Tappable, Text, TextField } from '@/ui'

/** Every figure, in the order the card reads them. */
const FIELDS = ['kcal', 'carbs', 'protein', 'fat'] as const

/**
 * The four figures the USER typed, as strings, and empty means "not overridden" —
 * `food_logs` stores each `override_*` column null in that case and every total in
 * the app follows the snapshot instead.
 *
 * The fields themselves are PRE-FILLED with the current figure rather than left
 * empty over a placeholder: a box you can see the number in is a box you can
 * correct, where an empty one asks you to remember what you are replacing. Which
 * means the emptiness has to be recovered on the way out — a field still holding
 * the app's own answer is not an override, and `saveFigures` on the screen is what
 * compares the two and writes null. Without that, opening this sheet and pressing
 * Save would pin all four figures as the user's, and a portion change afterwards
 * would stop moving the calories.
 */
export type TypedFigures = { kcal: string; carbs: string; protein: string; fat: string }

export const NO_FIGURES: TypedFigures = { kcal: '', carbs: '', protein: '', fat: '' }

export type NutritionSheetProps = {
  visible: boolean
  onClose: () => void
  /** What is staged on the screen behind, which is what this opens on. */
  value: TypedFigures
  /** What the app worked out. Fills any field the user has not overridden. */
  computed: Macros
  /** Writes them. Throws to leave the sheet open with the draft still in it. */
  onSave: (next: TypedFigures) => Promise<void>
  /** Said when the write failed. The sheet stays where it is. */
  onError: () => void
}

/**
 * Type your own figures for a logged entry, for the dish the app got close but
 * not right and the person eating it knows the answer. Each field stands alone,
 * the way `food_logs`'s four `override_*` columns do, so correcting only the
 * protein keeps the catalogue's carbs.
 *
 * It saves itself: a sheet whose button said "Done" and wrote nothing was a
 * second staging level nobody asked for. A failure leaves the draft where it is.
 *
 * Full height because it raises the pad, and the button is in the body rather
 * than a footer, which at full height lands behind the keyboard.
 */
export function NutritionSheet({
  visible,
  onClose,
  value,
  computed,
  onSave,
  onError,
}: NutritionSheetProps) {
  const { t } = useTranslation(['logging', 'common'])

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      /* NO TITLE AND NO DESCRIPTION. Four labelled fields with numbers in them,
         opened from a pencil on a card headed KCAL TOTAL, say what they are; a
         heading reading "Your own figures" and a paragraph explaining that an
         empty box keeps the app's answer were two more things to read on the way
         to a box. */
      closeLabel={t('common:action.close')}
      fullHeight
    >
      {/* Mounted only while the sheet is up, which IS the seeding: the draft
          below is `useState`, so a fresh mount reads whatever is staged on the
          screen now. Rendered conditionally rather than keyed, because a sheet
          has no natural key for "this opening" — and the fall animation happens
          before `onClose`, so the form is still here while the panel leaves. */}
      {visible ? (
        <FiguresForm
          value={value}
          computed={computed}
          onSave={onSave}
          onError={onError}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  )
}

function FiguresForm({
  value,
  computed,
  onSave,
  onError,
  onClose,
}: Pick<NutritionSheetProps, 'value' | 'computed' | 'onSave' | 'onError' | 'onClose'>) {
  const { t } = useTranslation(['logging', 'common'])

  /** Whatever the user typed over this figure, or the app's own answer for it. */
  const filled = (typed: string, own: number) => (typed.trim() ? typed : String(own))
  const appFigures: TypedFigures = {
    kcal: String(computed.kcal),
    carbs: String(computed.carbs),
    protein: String(computed.protein),
    fat: String(computed.fat),
  }

  const [draft, setDraft] = useState<TypedFigures>({
    kcal: filled(value.kcal, computed.kcal),
    carbs: filled(value.carbs, computed.carbs),
    protein: filled(value.protein, computed.protein),
    fat: filled(value.fat, computed.fat),
  })
  const [saving, setSaving] = useState(false)

  const set = (field: keyof TypedFigures) => (next: string) =>
    setDraft((current) => ({ ...current, [field]: next }))

  /**
   * Whether any box now holds something other than the app's answer.
   *
   * What the reset link keys on, and it cannot be "is any box non-empty" any more
   * — every box has a number in it. Compared as the strings both sides were built
   * from, which round-trip exactly: these are integers and one-decimal grams.
   */
  const edited = FIELDS.some((field) => draft[field].trim() !== appFigures[field])

  const save = async () => {
    setSaving(true)
    try {
      await onSave(draft)
    } catch {
      onError()
      setSaving(false)
      return
    }
    onClose()
  }

  return (
    <View className="gap-3">
      <TextField
        label={t('logging:detail.editKcal')}
        value={draft.kcal}
        onChangeText={set('kcal')}
        /* Whole numbers only: this figure is a calorie count, and 220.5 kcal is
           a precision nobody has about a plate of food. */
        keyboardType="number-pad"
        placeholder={String(computed.kcal)}
        selectTextOnFocus
        maxLength={5}
        rightSlot={
          <Text variant="label" className="text-muted">
            {t('common:unit.kcal')}
          </Text>
        }
      />

      {/* Three across, which is how they read on the card behind, and each one
          labelled with its own macro — a "MACROS" overline above them was a
          heading for three things that were already named. Grams to a tenth, the
          resolution the database stores. */}
      <View className="flex-row gap-2.5">
        <TextField
          containerClassName="flex-1"
          label={t('common:macro.carbs')}
          value={draft.carbs}
          onChangeText={set('carbs')}
          keyboardType="decimal-pad"
          placeholder={String(computed.carbs)}
          selectTextOnFocus
          maxLength={6}
        />
        <TextField
          containerClassName="flex-1"
          label={t('common:macro.protein')}
          value={draft.protein}
          onChangeText={set('protein')}
          keyboardType="decimal-pad"
          placeholder={String(computed.protein)}
          selectTextOnFocus
          maxLength={6}
        />
        <TextField
          containerClassName="flex-1"
          label={t('common:macro.fat')}
          value={draft.fat}
          onChangeText={set('fat')}
          keyboardType="decimal-pad"
          placeholder={String(computed.fat)}
          selectTextOnFocus
          maxLength={6}
        />
      </View>

      {/* The way back to the app's own numbers, and the only control here that is
          not a field. It FILLS all four with them rather than emptying the boxes,
          which is the same answer said in the shape the fields now take: four
          figures equal to the app's are four columns written null. All four rather
          than one, because "use the app's figures" is one answer about the entry. */}
      {edited ? (
        <Tappable
          className="self-start py-1"
          onPress={() => setDraft(appFigures)}
          accessibilityRole="button"
          accessibilityLabel={t('logging:detail.numbersReset')}
        >
          <Text variant="label" className="text-pandan-ink">
            {t('logging:detail.numbersReset')}
          </Text>
        </Tappable>
      ) : null}

      <Button fullWidth loading={saving} onPress={() => void save()}>
        {t('logging:detail.save')}
      </Button>
    </View>
  )
}
