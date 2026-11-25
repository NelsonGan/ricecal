import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextInput, View } from 'react-native'

import type { RecipeIngredientInput, Units } from '@/data'
import {
  type MeasureChoice,
  MeasureList,
  offeredChoices,
  UnitPill,
} from '@/features/shared/MeasurePicker'
import { PartRow } from '@/features/shared/PartRow'
import { measureFigure, useMeasureText } from '@/features/shared/useMeasureText'
import { type MeasureUnit, roundedFor, stepFor, steppedTo } from '@/lib/measures'
import { formatPortion } from '@/lib/portions'
import { useThemeColors } from '@/theme/useTheme'
import { Card, cn, Divider, Icon, Sheet, Tappable, TEXT_SCALES, Text, useNumpadField } from '@/ui'
import {
  displayUnitFor,
  type IngredientKey,
  ingredientTotal,
  keyOf,
  sameFamily,
  shownAmount,
  storedFrom,
} from './basis'
import { useUnitName } from './UnitGroups'
import { useIngredientMeasure } from './useIngredientMeasure'

export type EditableRecipeIngredient = RecipeIngredientInput & { key: string }

export type RecipeIngredientEditorProps = {
  ingredients: readonly EditableRecipeIngredient[]
  /** The new amount in the row's STORED unit: grams, millilitres or pieces. */
  onAmountChange: (key: string, amount: number) => void
  /**
   * The unit the row is shown in, within its own family: 30 ml as 2 tbsp. The
   * amount does not move, which is why only the family is offered; crossing
   * from millilitres to grams would need the food's density, and the row only
   * kept its calories per millilitre.
   */
  onUnitChange?: (key: string, displayUnit: MeasureUnit | undefined) => void
  /** The person's unit system, which decides whether ounces are on offer. */
  units?: Units
  onAdd: () => void
  onRemove: (ingredient: EditableRecipeIngredient) => void
  onReplace: (ingredient: EditableRecipeIngredient) => void
}

const MIN_AMOUNT = 0.01
const MAX_AMOUNT = 100_000

const roundedAmount = (value: number) => Math.round(value * 100) / 100

/**
 * Where one nudge lands, in the unit the row is SHOWN in, handed back in the unit
 * it is stored in. Grams and millilitres move by ten, as a plate's measured
 * ingredients do; spoons by a half and cups by a quarter, as a measuring set
 * does; countable things by one. A small amount still gets one useful last step
 * down to a practical floor.
 */
function stepAmount(amount: number, key: IngredientKey, direction: 1 | -1) {
  const { step, min: floor } = key === 'piece' ? { step: 1, min: 0.25 } : stepFor(key)
  const shown = shownAmount(amount, key)
  // On the unit's own marks: 0.41 cup steps to 0.5, not 0.66.
  const next = roundedAmount(steppedTo(shown, step, direction))
  if (direction < 0) {
    if (shown <= floor) return null
    return storedFrom(Math.max(floor, next), key)
  }
  const stored = storedFrom(next, key)
  return stored > MAX_AMOUNT ? null : stored
}

/** The amount, typed where it is read, using the same compact row as a plate part. */
function AmountField({
  ingredient,
  unitKey,
  figure,
  measure,
  onChange,
}: {
  ingredient: EditableRecipeIngredient
  unitKey: IngredientKey
  /** The amount alone, in the unit shown: "2". */
  figure: string
  /** The amount with its unit, for the screen reader: "2 tbsp". */
  measure: string
  onChange: (amount: number) => void
}) {
  const colors = useThemeColors()
  const { t } = useTranslation('recipes')
  const [typed, setTyped] = useState<string | null>(null)

  // Typed in the unit shown and stored in the row's own: "2" beside tbsp is
  // 29.57 ml. The bounds are the column's, so they are checked on the stored
  // figure.
  const commit = () => {
    const raw = (typed ?? '').replace(',', '.').trim()
    const parsed = Number(raw)
    setTyped(null)
    if (!raw || !Number.isFinite(parsed)) return
    const stored = storedFrom(parsed, unitKey)
    if (stored < MIN_AMOUNT || stored > MAX_AMOUNT) return
    onChange(roundedAmount(stored))
  }

  const label = t('ingredient.change', { name: ingredient.name, measure })
  const numpad = useNumpadField({
    value: typed ?? '',
    onChangeText: setTyped,
    decimal: true,
    maxLength: 9,
    label,
    onFocus: () => setTyped(''),
    onBlur: commit,
    returnKeyType: 'done',
  })

  return (
    <TextInput
      allowFontScaling={TEXT_SCALES}
      value={typed ?? figure}
      onChangeText={setTyped}
      onSubmitEditing={commit}
      placeholder={typed === '' ? figure : undefined}
      placeholderTextColor={colors.faint}
      keyboardType="decimal-pad"
      underlineColorAndroid="transparent"
      accessibilityLabel={label}
      className={cn(
        // Sized to the figure, inside the pill: "1,234.5" at most, and the
        // pill's own minimum width keeps the rows lined up.
        'min-w-[36px] max-w-[88px] border-b-2 pb-0.5 text-center font-body-black text-[17px] text-ink',
        // Pandan, dashed: the line colour of the old field disappeared against
        // the pill's mint, and the rule is the only sign the number is typable.
        typed === null ? 'border-pandan border-dashed' : 'border-pandan',
      )}
      style={{ paddingVertical: 0 }}
      cursorColor={colors.pandan}
      selectionColor={colors.pandan}
      {...numpad}
    />
  )
}

/**
 * The pot's ingredients, using the same row grammar as the diary plate editor:
 * amount controls in place, and Replace/Delete behind a deliberate swipe.
 */
export function RecipeIngredientEditor({
  ingredients,
  onAmountChange,
  onUnitChange,
  units,
  onAdd,
  onRemove,
  onReplace,
}: RecipeIngredientEditorProps) {
  const { t } = useTranslation(['recipes', 'logging', 'common'])
  const measureText = useMeasureText()
  const ingredientMeasure = useIngredientMeasure()
  /** The row whose unit sheet is open. */
  const [choosing, setChoosing] = useState<EditableRecipeIngredient | null>(null)

  const unitName = useUnitName()

  /**
   * The units a row can be read in, each as the amount it would read as and
   * what it would cost. One function for the sheet and for whether the row's
   * pill is a control at all, so the pill never opens a list of itself.
   */
  const unitChoices = (row: EditableRecipeIngredient): MeasureChoice[] =>
    sameFamily(keyOf(row.unit, row.displayUnit), units).map((key) => {
      const current = key === keyOf(row.unit, row.displayUnit)
      // The current line shows the amount exactly as it stands; every
      // other line shows it rounded to what that unit is worth showing.
      const amount =
        key === 'piece' || current
          ? shownAmount(row.amount, key)
          : roundedFor(key, shownAmount(row.amount, key))
      const stored = key === 'piece' ? row.amount : roundedAmount(storedFrom(amount, key))
      return {
        key,
        title:
          key === 'piece'
            ? `${formatPortion(amount)} ${unitName(key, amount)}`
            : measureText.amount(amount, key),
        // What the row would cost once rounded to that line, so the
        // calorie or so a spoon rounds by is seen before it happens.
        detail: t('logging:detail.partKcal', {
          kcal: ingredientTotal(row.perUnit, stored).kcal.toLocaleString(),
        }),
        selected: current,
        // A unit whose nearest figure would move the row by more than a
        // measuring spoon's worth is not offered: 10.5 g as kilograms
        // is 0.01 kg, 5% less sugar.
        disabled: !current && Math.abs(stored - row.amount) > row.amount * 0.025,
        onPress: () => {
          // The unit in use, picked again, is no change: rounding it
          // to itself would still move 10.5 g to 11.
          if (current) {
            setChoosing(null)
            return
          }
          // The line said "6½ tbsp", so that is what the row reads
          // afterwards. Rounding only ever lands within 2%, where a
          // label-only switch left 6.56 under the finger.
          if (key !== 'piece' && stored !== row.amount && amount > 0) {
            onAmountChange(row.key, stored)
          }
          // The stored unit itself is "no display unit", so a row
          // moved back to grams is a row exactly as an old build wrote
          // it.
          onUnitChange?.(row.key, displayUnitFor(key))
          setChoosing(null)
        },
      }
    })

  return (
    <Card flush contentClassName="gap-0">
      {ingredients.map((ingredient, index) => {
        const line = ingredientTotal(ingredient.perUnit, ingredient.amount)
        const unitKey = keyOf(ingredient.unit, ingredient.displayUnit)
        const shown = shownAmount(ingredient.amount, unitKey)
        // The same figure the rest of the app prints: "6½", "1,234".
        const figure = unitKey === 'piece' ? formatPortion(shown) : measureFigure(unitKey, shown)
        const name = unitName(unitKey, shown)
        const measure = ingredientMeasure(ingredient)
        const less = stepAmount(ingredient.amount, unitKey, -1)
        const more = stepAmount(ingredient.amount, unitKey, 1)
        const switchable =
          Boolean(onUnitChange) && offeredChoices(unitChoices(ingredient)).length > 1

        return (
          <View key={ingredient.key}>
            {index > 0 ? <Divider className="mx-card" /> : null}
            <PartRow
              name={ingredient.name}
              title={<Text variant="bodyStrong">{ingredient.name}</Text>}
              kcal={line.kcal}
              removeLabel={`${t('recipes:ingredient.remove')}, ${ingredient.name}`}
              onReplace={() => onReplace(ingredient)}
              onRemove={() => onRemove(ingredient)}
              onLess={less === null ? null : () => onAmountChange(ingredient.key, less)}
              onMore={more === null ? null : () => onAmountChange(ingredient.key, more)}
              joined
            >
              <AmountField
                // Replacing preserves the row key so the swipe row stays put. The
                // field also needs the ingredient identity or a half-typed amount
                // can survive into the replacement, and the unit, or a number
                // half-typed in grams survives into ounces.
                key={`${ingredient.key}:${ingredient.foodId ?? ingredient.name}:${unitKey}`}
                ingredient={ingredient}
                unitKey={unitKey}
                figure={figure}
                measure={measure}
                onChange={(amount) => onAmountChange(ingredient.key, amount)}
              />
              {/* The unit beside the number, and a way to change it when the
                  row's family has others: "30 ml" read as 2 tbsp. */}
              {switchable ? (
                <UnitPill
                  size="sm"
                  label={name}
                  onPress={() => setChoosing(ingredient)}
                  accessibilityLabel={t('recipes:ingredient.changeUnit', {
                    name: ingredient.name,
                    unit: name,
                  })}
                />
              ) : (
                // Not a control when there is nothing to change it to, so not
                // in the action colour either.
                <Text className="font-display text-[15px] leading-[24px] text-muted">{name}</Text>
              )}
            </PartRow>
          </View>
        )
      })}

      {ingredients.length > 0 ? <Divider className="mx-card" /> : null}

      <Sheet
        visible={choosing !== null}
        onClose={() => setChoosing(null)}
        title={t('recipes:ingredient.unitTitle')}
        closeLabel={t('common:action.close')}
      >
        {choosing ? (
          // A list rather than chips: each line names the unit and what this
          // row would read as in it, so the choice shows its result before it
          // is made. As chips the five amounts wrapped and read as figures.
          <MeasureList choices={unitChoices(choosing)} />
        ) : null}
      </Sheet>
      <Tappable
        className="flex-row items-center gap-2.5 px-card py-md"
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={t('recipes:edit.addIngredient')}
      >
        <View className="h-[30px] w-[30px] items-center justify-center rounded-md bg-pandan-soft">
          <Icon set="ui" name="plus" size={16} />
        </View>
        <Text variant="label" className="text-pandan-ink">
          {t('recipes:edit.addIngredient')}
        </Text>
      </Tappable>
    </Card>
  )
}
