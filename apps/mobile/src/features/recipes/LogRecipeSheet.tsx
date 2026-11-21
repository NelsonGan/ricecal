import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Recipe } from '@/data'
import { Button, Chip, Sheet, Stepper, Text } from '@/ui'
import { useLogRecipe } from './useLogRecipe'

export type LogRecipeSheetProps = {
  visible: boolean
  onClose: () => void
  recipe: Recipe
  logDate: string
  /** Whether `logDate` is today, which decides what the button says. */
  isToday: boolean
  /** After the row is written. Cook mode leaves the screen here. */
  onLogged?: () => void
}

/**
 * How much of the pot was eaten, then into the diary. Shared by the recipe page
 * and the end of cook mode, so somebody who had two bowls is asked rather than
 * logged one and left to correct it in the diary.
 */
export function LogRecipeSheet({
  visible,
  onClose,
  recipe,
  logDate,
  isToday,
  onLogged,
}: LogRecipeSheetProps) {
  const { t } = useTranslation(['recipes', 'common'])
  const { log, pending } = useLogRecipe()
  const [quantity, setQuantity] = useState(1)

  const portions: Array<{ key: string; label: string; value: number }> = [
    { key: 'half', label: t('recipes:detail.portion.half'), value: 0.5 },
    { key: 'one', label: t('recipes:detail.portion.one'), value: 1 },
    { key: 'two', label: t('recipes:detail.portion.two'), value: 2 },
    ...(recipe.servings > 2
      ? [{ key: 'pot', label: t('recipes:detail.portion.pot'), value: recipe.servings }]
      : []),
  ]
  // "Add to today" only when it is. From the log sheet on an earlier day the
  // entry goes to that day, and the button says no more than "Add".
  const action = isToday ? t('recipes:detail.addToDay') : t('common:action.add')

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onShow={() => setQuantity(1)}
      title={t('recipes:detail.logTitle')}
      closeLabel={t('common:action.close')}
      scrollable={false}
      footer={
        <Button
          fullWidth
          loading={pending}
          onPress={() =>
            log(recipe, quantity, logDate, () => {
              onClose()
              onLogged?.()
            })
          }
        >
          {action}
        </Button>
      }
    >
      <View className="gap-4">
        <Stepper
          value={quantity}
          onChange={setQuantity}
          step={0.5}
          min={0.5}
          max={recipe.servings * 2}
          unit={t('recipes:detail.servingLabel', { count: quantity })}
          decrementLabel={t('common:a11y.decrease')}
          incrementLabel={t('common:a11y.increase')}
        />
        <View className="flex-row flex-wrap gap-2">
          {portions.map((portion) => (
            <Chip
              key={portion.key}
              selected={quantity === portion.value}
              onPress={() => setQuantity(portion.value)}
            >
              {portion.label}
            </Chip>
          ))}
        </View>
        <View className="flex-row items-baseline justify-between">
          <Text variant="overline">
            {t('recipes:detail.ofServings', { count: quantity, total: recipe.servings })}
          </Text>
          <View className="flex-row items-baseline gap-1">
            <Text variant="numeric" className="text-pandan-ink">
              {Math.round(recipe.perServing.kcal * quantity).toLocaleString()}
            </Text>
            <Text variant="caption">{t('common:unit.kcal')}</Text>
          </View>
        </View>
      </View>
    </Sheet>
  )
}
