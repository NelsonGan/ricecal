import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextInput, View } from 'react-native'

import type { RecipeIngredientInput } from '@/data'
import { SwipeRow } from '@/features/shared'
import { useThemeColors } from '@/theme/useTheme'
import { Card, cn, Divider, Icon, IconButton, Tappable, Text, useNumpadField } from '@/ui'
import { ingredientTotal } from './basis'

export type EditableRecipeIngredient = RecipeIngredientInput & { key: string }

export type RecipeIngredientEditorProps = {
  ingredients: readonly EditableRecipeIngredient[]
  onAmountChange: (key: string, amount: number) => void
  onAdd: () => void
  onRemove: (ingredient: EditableRecipeIngredient) => void
  onReplace: (ingredient: EditableRecipeIngredient) => void
}

const MIN_AMOUNT = 0.01
const MAX_AMOUNT = 100_000

const roundedAmount = (value: number) => Math.round(value * 100) / 100

/**
 * Where one nudge lands. Weights and volumes move by ten, as a plate's measured
 * ingredients do; countable things move by one. A small amount still gets one
 * useful last step down to a practical quarter-piece or one-unit floor.
 */
function stepAmount(amount: number, unit: RecipeIngredientInput['unit'], direction: 1 | -1) {
  const step = unit === 'piece' ? 1 : 10
  const floor = unit === 'piece' ? 0.25 : 1
  const next = roundedAmount(amount + step * direction)
  if (direction < 0) {
    if (amount <= floor) return null
    return Math.max(floor, next)
  }
  return next > MAX_AMOUNT ? null : next
}

/** The amount, typed where it is read, using the same compact row as a plate part. */
function AmountField({
  ingredient,
  measure,
  onChange,
}: {
  ingredient: EditableRecipeIngredient
  measure: string
  onChange: (amount: number) => void
}) {
  const colors = useThemeColors()
  const { t } = useTranslation('recipes')
  const [typed, setTyped] = useState<string | null>(null)

  const commit = () => {
    const raw = (typed ?? '').replace(',', '.').trim()
    const parsed = Number(raw)
    setTyped(null)
    if (!raw || !Number.isFinite(parsed) || parsed < MIN_AMOUNT || parsed > MAX_AMOUNT) return
    onChange(roundedAmount(parsed))
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
      value={typed ?? measure}
      onChangeText={setTyped}
      onSubmitEditing={commit}
      placeholder={typed === '' ? String(ingredient.amount) : undefined}
      placeholderTextColor={colors.faint}
      keyboardType="decimal-pad"
      underlineColorAndroid="transparent"
      accessibilityLabel={label}
      className={cn(
        'w-[86px] border-b-2 pb-0.5 text-center font-body-black text-[15px] text-ink',
        typed === null ? 'border-line border-dashed' : 'border-pandan',
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
  onAdd,
  onRemove,
  onReplace,
}: RecipeIngredientEditorProps) {
  const { t } = useTranslation(['recipes', 'logging', 'common'])
  const colors = useThemeColors()

  return (
    <Card flush contentClassName="gap-0">
      {ingredients.map((ingredient, index) => {
        const line = ingredientTotal(ingredient.perUnit, ingredient.amount)
        const measure = `${ingredient.amount.toLocaleString()} ${t(
          `recipes:ingredient.unit.${ingredient.unit}`,
          { count: ingredient.amount },
        )}`
        const less = stepAmount(ingredient.amount, ingredient.unit, -1)
        const more = stepAmount(ingredient.amount, ingredient.unit, 1)

        return (
          <View key={ingredient.key}>
            {index > 0 ? <Divider className="mx-card" /> : null}
            <SwipeRow
              square
              actions={[
                {
                  label: t('logging:detail.replacePart'),
                  a11yLabel: t('logging:detail.replaceOf', { name: ingredient.name }),
                  icon: 'swap',
                  tone: 'water',
                  onPress: () => onReplace(ingredient),
                },
                {
                  label: t('common:action.delete'),
                  a11yLabel: `${t('recipes:ingredient.remove')}, ${ingredient.name}`,
                  icon: 'delete',
                  tone: 'hibiscus',
                  exits: true,
                  onPress: () => onRemove(ingredient),
                },
              ]}
            >
              <View className="gap-2 bg-surface px-card py-md">
                <Text variant="bodyStrong">{ingredient.name}</Text>
                <View className="flex-row items-center justify-between gap-3">
                  <Text variant="meta" className="min-w-0 flex-1">
                    {t('logging:detail.partKcal', { kcal: line.kcal.toLocaleString() })}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <IconButton
                      size="sm"
                      variant="neutral"
                      accessibilityLabel={t('logging:detail.lessOf', { name: ingredient.name })}
                      disabled={less === null}
                      onPress={() => {
                        if (less !== null) onAmountChange(ingredient.key, less)
                      }}
                    >
                      <Icon set="ui" name="minus" size={16} tintColor={colors.ink} />
                    </IconButton>
                    <AmountField
                      ingredient={ingredient}
                      measure={measure}
                      onChange={(amount) => onAmountChange(ingredient.key, amount)}
                    />
                    <IconButton
                      size="sm"
                      variant="neutral"
                      accessibilityLabel={t('logging:detail.moreOf', { name: ingredient.name })}
                      disabled={more === null}
                      onPress={() => {
                        if (more !== null) onAmountChange(ingredient.key, more)
                      }}
                    >
                      <Icon set="ui" name="plus" size={16} tintColor={colors.ink} />
                    </IconButton>
                  </View>
                </View>
              </View>
            </SwipeRow>
          </View>
        )
      })}

      {ingredients.length > 0 ? <Divider className="mx-card" /> : null}
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
