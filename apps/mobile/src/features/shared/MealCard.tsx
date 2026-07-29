import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import {
  type DayLog,
  type Entry,
  entriesForMeal,
  entryMacros,
  getFood,
  getServing,
  type Meal,
} from '@/mock'
import { Card, Text } from '@/ui'
import { ItemRow } from './ItemRow'

export type MealCardProps = {
  meal: Meal
  day: DayLog
  /** Highlighted entry id — the one that was just added. */
  highlightId?: string
  /** What the detail line under each dish says. */
  detail?: 'serving' | 'time'
  /** Receives the whole entry: opening its detail needs the food id too. */
  onPressEntry?: (entry: Entry) => void
  onAdd?: () => void
}

/**
 * One meal's card: heading, its entries, and an add affordance when empty.
 *
 * The heading carries the meal's total only when there is something to total —
 * "DINNER · 0 KCAL" reads as a failure, "DINNER" reads as not yet.
 */
export function MealCard({
  meal,
  day,
  highlightId,
  detail = 'serving',
  onPressEntry,
  onAdd,
}: MealCardProps) {
  const { t } = useTranslation(['logging', 'common'])
  const entries = entriesForMeal(day, meal)
  const mealName = t(`common:meal.${meal}`)

  const kcal = entries.reduce((total, entry) => total + entryMacros(entry).kcal, 0)

  const heading = entries.length
    ? t('logging:today.mealHeading', { meal: mealName.toUpperCase(), kcal: kcal.toLocaleString() })
    : mealName.toUpperCase()

  return (
    <Card title={heading}>
      {entries.map((entry) => {
        const food = getFood(entry.foodId)
        const serving = getServing(food, entry.servingId)
        return (
          <ItemRow
            key={entry.id}
            title={food.name}
            icon={food.icon}
            value={entryMacros(entry).kcal}
            unit="kcal"
            detail={
              entry.id === highlightId
                ? t('logging:today.justAdded')
                : detail === 'time'
                  ? formatTime(entry.loggedAt)
                  : `${entry.quantity > 1 ? `${entry.quantity} × ` : ''}${serving.label}`
            }
            highlighted={entry.id === highlightId}
            onPress={onPressEntry ? () => onPressEntry(entry) : undefined}
          />
        )
      })}

      {entries.length === 0 && onAdd ? (
        <Pressable
          onPress={onAdd}
          className="items-center justify-center rounded-tile border-[3px] border-line border-dashed p-3"
          accessibilityRole="button"
          accessibilityLabel={t('logging:today.addMeal', { meal: mealName })}
        >
          <Text variant="label" className="text-muted">
            + {t('logging:today.addMeal', { meal: mealName.toLowerCase() })}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  )
}

/** "8:20 am". Locale-independent on purpose: the mock data is Malaysian. */
function formatTime(iso: string): string {
  const date = new Date(iso)
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const suffix = hours < 12 ? 'am' : 'pm'
  const twelve = hours % 12 === 0 ? 12 : hours % 12
  return `${twelve}:${minutes} ${suffix}`
}

export { formatTime }
