import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Recipe } from '@/data'
import { Button, Sheet, Slider, Text } from '@/ui'
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

/** "½", "1½", "2": a serving count the way it is said, not "1.5". */
function servingsText(value: number): string {
  const whole = Math.floor(value)
  const half = value - whole >= 0.5
  if (!half) return whole.toLocaleString()
  return whole === 0 ? '½' : `${whole.toLocaleString()}½`
}

/**
 * How much of the pot was eaten, then into the diary. Shared by the recipe page
 * and the end of cook mode, so somebody who had two bowls is asked rather than
 * logged one and left to correct it in the diary.
 *
 * One slider from half a serving to the whole pot, under the figure it moves.
 * It replaced a stepper over a row of shortcut pills (Half, 1, 2, Whole pot),
 * which asked the same question three ways at once. The calories are the big
 * number because they are what the choice changes in the diary.
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

  // The whole pot is the end of the scale, and a pot that feeds one still
  // reaches two, for the second sandwich.
  const max = Math.max(recipe.servings, 2)
  const kcal = Math.round(recipe.perServing.kcal * quantity)
  /**
   * Half, then every whole serving while there is room for them, then the
   * whole pot at the end. Past six a scale of numbers is a ruler, so a big pot
   * marks half, the middle and the end.
   */
  const potLabel = (value: number) =>
    value === recipe.servings ? t('recipes:detail.portion.pot') : servingsText(value)
  const wholes =
    max <= 6 ? Array.from({ length: max }, (_, index) => index + 1) : [Math.round(max / 2), max]
  const marks = [0.5, ...wholes].map((value) => ({ value, label: potLabel(value) }))
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
      <View className="gap-5">
        <View className="items-center gap-1">
          <View className="flex-row items-baseline gap-1.5">
            <Text variant="display" className="text-pandan-ink">
              {kcal.toLocaleString()}
            </Text>
            <Text variant="label" className="text-muted">
              {t('common:unit.kcal')}
            </Text>
          </View>
          <Text variant="overline">
            {/* "1½ OF 4", not "1.5 OF 4". The key has no plural forms, so the
                count may be the spoken fraction rather than a number. */}
            {t('recipes:detail.ofServings', {
              count: servingsText(quantity) as unknown as number,
              total: recipe.servings,
            })}
          </Text>
        </View>

        <Slider
          value={quantity}
          onChange={setQuantity}
          min={0.5}
          max={max}
          step={0.5}
          accessibilityLabel={t('recipes:detail.logTitle')}
          format={(value) =>
            value === recipe.servings && value === max
              ? t('recipes:detail.portion.pot')
              : servingsText(value)
          }
          marks={marks}
        />

        <Text variant="meta" className="text-center">
          {`${recipe.perServing.kcal.toLocaleString()} ${t('common:unit.kcal')} ${t('recipes:detail.perServing')}`}
        </Text>
      </View>
    </Sheet>
  )
}
