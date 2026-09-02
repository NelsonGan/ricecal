import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { energyOf, KCAL_RANGE, MACRO_RANGE } from '@/lib/nutrition'
import { Card, Tappable, Text, TextField } from '@/ui'

/** Every figure, in the order the card reads them. */
const FIELDS = ['kcal', 'carbs', 'protein', 'fat'] as const

export type Budget = { kcal: number; carbs: number; protein: number; fat: number }

/**
 * The four figures as strings, because they are being typed.
 *
 * A number cannot hold a half-typed field: clearing the box to retype it is a
 * moment where the value is neither the old figure nor a new one, and storing
 * that as 0 writes a budget of nothing under the user's cursor. The same
 * reasoning as the three numeric fields on the `about` step, and as
 * `TypedFigures` in `NutritionSheet`.
 */
export type BudgetFields = Record<(typeof FIELDS)[number], string>

/** The formula's answer, in the shape the fields hold. */
export function budgetFields(budget: Budget): BudgetFields {
  return {
    kcal: String(budget.kcal),
    carbs: String(budget.carbs),
    protein: String(budget.protein),
    fat: String(budget.fat),
  }
}

/**
 * What the fields MEAN, clamped to what the database will store.
 *
 * A field holding nothing falls back to the figure it was seeded from rather
 * than to zero: an empty box is a box mid-edit, and `daily_goals` has no way to
 * express "the user was still typing".
 */
export function readBudget(fields: BudgetFields, fallback: Budget): Budget {
  const read = (text: string, own: number, within: { min: number; max: number }) => {
    const value = Number(text.trim())
    const meant = !text.trim() || !Number.isFinite(value) || value < 0 ? own : Math.round(value)
    // Clamped whichever it came from. A fallback outside the range is reachable:
    // the goals screen holds a budget of zero until its queries answer, and
    // `daily_goals.kcal` will not store one.
    return Math.min(within.max, Math.max(within.min, meant))
  }

  return {
    kcal: read(fields.kcal, fallback.kcal, KCAL_RANGE),
    carbs: read(fields.carbs, fallback.carbs, MACRO_RANGE),
    protein: read(fields.protein, fallback.protein, MACRO_RANGE),
    fat: read(fields.fat, fallback.fat, MACRO_RANGE),
  }
}

/** Whether two budgets say the same thing. */
export function sameBudget(a: Budget, b: Budget): boolean {
  return FIELDS.every((field) => a[field] === b[field])
}

/**
 * Whether these fields still MEAN what the formula asks for.
 *
 * Read rather than compared as text, so the three ways of typing the same figure
 * — "104", "104.4", and an empty box, which falls back to the recommendation —
 * are one answer. Text comparison made an empty box a hand-set budget, and
 * `is_custom` is the flag that stops the database ever recomputing.
 */
export function isRecommended(fields: BudgetFields, recommended: Budget): boolean {
  return sameBudget(readBudget(fields, recommended), recommended)
}

/**
 * How far the macros are allowed to drift from the calorie figure before the
 * card says so. Rounding the split leaves a couple of calories on the table, and
 * a card announcing a 2 kcal discrepancy is a card that looks broken.
 */
const DRIFT_TOLERANCE_KCAL = 15

export type BudgetEditorProps = {
  value: BudgetFields
  onChange: (next: BudgetFields) => void
  /**
   * What the formula asks for, for this body and this plan. It names itself in
   * the calorie box's placeholder, and it is what the reset link fills all four
   * fields with.
   */
  recommended: Budget
  /** Puts the four figures back under the formula's control. */
  onReset: () => void
}

/**
 * The daily budget, as four numbers somebody can change.
 *
 * All four are independent, which is the only model that does not move a number
 * the user did not touch. The alternative — re-splitting the macros whenever the
 * calorie total moves — quietly overwrites a protein target somebody set on
 * purpose, and re-splitting is what the reset link is for.
 *
 * The cost is that the macros can stop adding up to the calorie figure, so the
 * card says what they add up to whenever they do. It says it rather than
 * correcting it: four targets that disagree is a real thing to want (protein
 * first, calories as a ceiling), and the four rings and bars around the app have
 * always been drawn against four independent numbers.
 *
 * Editing is why this is shared. It is the same card on the onboarding target
 * step, where there is no account yet and the figures ride in the draft, and on
 * the goals screen, where they are a `daily_goals` row.
 */
export function BudgetEditor({ value, onChange, recommended, onReset }: BudgetEditorProps) {
  const { t } = useTranslation(['profile', 'common'])

  const set = (field: keyof BudgetFields) => (next: string) => onChange({ ...value, [field]: next })

  /**
   * What the box held when it was focused. One ref for all four, because only
   * one of them can be focused at a time.
   */
  const before = useRef('')

  /**
   * Blur is where the clamp becomes visible: "show me what you understood". The
   * same choice the height and weight fields on the `about` step make, and it is
   * what stops 300 kcal being saved as the 800 floor without saying so.
   *
   * A box left EMPTY goes back to what it held rather than to the formula's
   * answer. Backspacing to nothing is an ordinary step on the way to typing
   * something else, and a user who taps away mid-thought should not find their
   * protein target quietly replaced by the recommendation.
   *
   * Silent when the box already says what it means, so a focus and a blur are
   * not an edit. Nothing downstream depends on that any more — `is_custom` is
   * read off the FIGURES rather than off whether `onChange` has fired — but a
   * screen re-rendering because somebody tapped a field is work for nothing.
   */
  const settle = (field: keyof BudgetFields) => () => {
    const settled = value[field].trim()
      ? String(readBudget(value, recommended)[field])
      : before.current
    if (settled === value[field]) return
    onChange({ ...value, [field]: settled })
  }

  const budget = readBudget(value, recommended)
  const fromMacros = energyOf(budget)
  const drifted = Math.abs(fromMacros - budget.kcal) > DRIFT_TOLERANCE_KCAL

  const macro = (field: 'carbs' | 'protein' | 'fat') => (
    <TextField
      containerClassName="flex-1"
      label={t(`common:macro.${field}`)}
      value={value[field]}
      onChangeText={set(field)}
      onFocus={() => {
        before.current = value[field]
      }}
      onBlur={settle(field)}
      keyboardType="number-pad"
      placeholder={String(recommended[field])}
      selectTextOnFocus
      maxLength={4}
      inputClassName="font-display text-[22px]"
      rightSlot={<Text variant="caption">{t('common:unit.gram')}</Text>}
    />
  )

  return (
    <>
      {/* No card TITLE, and the field carries the name instead. The two would be
          the same words one above the other — but the label has a second job the
          title cannot do: it is what the app's own number pad puts in its header,
          and this field is under the pad by the time it opens. */}
      <Card>
        <TextField
          label={t('profile:goals.dailyCalories')}
          value={value.kcal}
          onChangeText={set('kcal')}
          onFocus={() => {
            before.current = value.kcal
          }}
          onBlur={settle('kcal')}
          /* Whole calories. Nobody has half a kilocalorie of intent about a day. */
          keyboardType="number-pad"
          // The recommendation, named where it is read: this used to be a
          // caption under the box as well, printing the same figure the box
          // already held on every budget nobody had touched.
          placeholder={t('profile:goals.recommended', {
            value: recommended.kcal.toLocaleString(),
          })}
          selectTextOnFocus
          maxLength={5}
          inputClassName="font-display text-[26px]"
          rightSlot={<Text variant="caption">{t('common:unit.kcal')}</Text>}
        />
      </Card>

      <Card title={t('profile:goals.macroTargets')}>
        {/* Three across, the way they read everywhere else in the app, each
            labelled with its own macro. Whole grams rather than the tenths an
            ENTRY carries: `daily_goals` stores integers, and nobody aims a
            day's protein to a tenth. */}
        <View className="flex-row gap-2.5">
          {macro('carbs')}
          {macro('protein')}
          {macro('fat')}
        </View>

        <View className="flex-row items-center justify-between gap-3">
          {/* Only when they disagree. On an untouched budget the three grams
              are the split of the figure above by construction, and a line
              restating that is a line saying nothing. */}
          <Text variant="caption" className="flex-1">
            {drifted
              ? t('profile:goals.macrosAddUpTo', { value: fromMacros.toLocaleString() })
              : ''}
          </Text>

          {/* Fills all four with the formula's answer rather than emptying them,
              which is the same choice `NutritionSheet` makes: "use the app's
              figures" is one answer about the budget, not four separate ones. */}
          {isRecommended(value, recommended) ? null : (
            <Tappable
              className="py-1"
              onPress={onReset}
              accessibilityRole="button"
              accessibilityLabel={t('profile:goals.useRecommended')}
            >
              <Text variant="label" className="text-pandan-ink">
                {t('profile:goals.useRecommended')}
              </Text>
            </Tappable>
          )}
        </View>
      </Card>
    </>
  )
}
