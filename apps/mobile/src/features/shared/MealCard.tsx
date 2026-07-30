import { useTranslation } from 'react-i18next'

import type { DayLog, Entry, Meal } from '@/data'
import { entriesForMeal, sumMacros } from '@/lib/nutrition'
import { Card, Tappable, Text } from '@/ui'
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
  /**
   * A snap the model could not read. Given a separate handler because the row
   * has no dish to open — the only thing to do with it is name it by hand.
   */
  onFixEntry?: (entry: Entry) => void
  onAdd?: () => void
}

/**
 * One meal's card: heading, its entries, and an add affordance when empty.
 *
 * The heading carries the meal's total only when there is something to total —
 * "DINNER · 0 KCAL" reads as a failure, "DINNER" reads as not yet.
 *
 * Nothing here looks a dish up. `food_log_details` returns each entry with its
 * name, its illustration and its macros already costed, so a row is one object
 * and a card is one loop.
 */
export function MealCard({
  meal,
  day,
  highlightId,
  detail = 'serving',
  onPressEntry,
  onFixEntry,
  onAdd,
}: MealCardProps) {
  const { t } = useTranslation(['logging', 'common'])
  const entries = entriesForMeal(day, meal)
  const mealName = t(`common:meal.${meal}`)

  const kcal = sumMacros(entries).kcal

  const heading = entries.length
    ? t('logging:today.mealHeading', { meal: mealName.toUpperCase(), kcal: kcal.toLocaleString() })
    : mealName.toUpperCase()

  return (
    <Card title={heading}>
      {entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          detail={detail}
          highlighted={entry.id === highlightId}
          onPress={onPressEntry}
          onFix={onFixEntry}
        />
      ))}

      {entries.length === 0 && onAdd ? (
        <Tappable
          onPress={onAdd}
          className="items-center justify-center rounded-tile border-[3px] border-line border-dashed p-3"
          accessibilityRole="button"
          accessibilityLabel={t('logging:today.addMeal', { meal: mealName })}
        >
          <Text variant="label" className="text-muted">
            + {t('logging:today.addMeal', { meal: mealName.toLowerCase() })}
          </Text>
        </Tappable>
      ) : null}
    </Card>
  )
}

/**
 * One logged item.
 *
 * Its own component so the photo can be resolved per row — a stored plate needs
 * a signed URL, which is a query, and a hook cannot run inside a `.map`.
 */
function EntryRow({
  entry,
  detail,
  highlighted,
  onPress,
  onFix,
}: {
  entry: Entry
  detail: 'serving' | 'time'
  highlighted: boolean
  onPress?: (entry: Entry) => void
  onFix?: (entry: Entry) => void
}) {
  const { t } = useTranslation(['logging', 'common'])

  // A snap in flight has no dish yet. It still gets a row — written the moment
  // the shutter fired — so the day is complete while the model is thinking.
  if (entry.status) {
    const analysing = entry.status === 'analysing'
    return (
      <ItemRow
        title={analysing ? t('logging:today.analysing') : t('logging:today.analysisFailedTitle')}
        icon={{ set: 'system', name: 'camera' }}
        photoUri={entry.localPhotoUri}
        busy={analysing}
        value={analysing ? '' : '—'}
        detail={
          analysing ? t('logging:today.analysingHint') : t('logging:today.analysisFailedHint')
        }
        onPress={analysing || !onFix ? undefined : () => onFix(entry)}
      />
    )
  }

  return (
    <ItemRow
      title={entry.foodName}
      icon={entry.icon}
      photoPath={entry.photoPath}
      value={entry.macros.kcal}
      unit="kcal"
      detail={
        highlighted
          ? t('logging:today.justAdded')
          : detail === 'time'
            ? formatTime(entry.loggedAt)
            : `${entry.quantity > 1 ? `${entry.quantity} × ` : ''}${entry.servingLabel}`
      }
      highlighted={highlighted}
      onPress={onPress ? () => onPress(entry) : undefined}
    />
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
