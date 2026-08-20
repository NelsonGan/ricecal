import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Entry } from '@/data'
import { sumMacros } from '@/lib/nutrition'
import { portionLabel } from '@/lib/portions'
import { Card, Icon, SkeletonRow, Text } from '@/ui'
import { ItemRow } from '../shared/ItemRow'

export type DayMealsProps = {
  date: string
  entries: Entry[]
  loading?: boolean
  onPressEntry: (entry: Entry) => void
  className?: string
}

/**
 * The day the calendar has selected, as a LIST of what was eaten on it.
 *
 * `ItemRow` rather than a row of this file's own, which is what makes it the
 * same list the diary draws — the same tile at the same size, the same figure on
 * the right. The month view and the day view are two ways of finding a meal, and
 * a meal should not look like two different things depending on which one found
 * it.
 *
 * NO COUNT IN THE HEADING. It read "Thursday 14, 4 meals", and the four rows
 * under it are the count — said twice, once as a number to trust and once as a
 * list to check it against.
 *
 * No swipe-to-delete either, unlike the diary's list. This is the day being
 * looked BACK at, the row opens the entry, and the delete is on the entry.
 */
export function DayMeals({
  date,
  entries,
  loading = false,
  onPressEntry,
  className,
}: DayMealsProps) {
  const { t } = useTranslation('logging')
  const total = sumMacros(entries)

  return (
    <Card
      className={className}
      title={t('calendar.dayHeading', { day: format(parseISO(date), 'EEEE d') })}
      action={
        entries.length > 0 ? (
          <Text variant="numeric" className="text-[16px] leading-[20px]">
            {t('calendar.dayKcal', { kcal: total.kcal.toLocaleString() })}
          </Text>
        ) : undefined
      }
    >
      {loading ? (
        // Two rows rather than one, for the reason the diary's placeholder gives:
        // one reads as a day with a single meal on it, and the point of the block
        // is that nobody yet knows how many there are.
        <>
          <SkeletonRow />
          <SkeletonRow />
        </>
      ) : entries.length === 0 ? (
        /* Art and a sentence rather than a bare line of text, because this card
           is under a grid full of pictures and a day with nothing on it is the
           one cell somebody taps to find out WHY it is empty. Not `EmptyState`,
           which draws its art at 96pt with a screen's worth of padding — that is
           the shape for a screen with nothing on it, and this is a card with a
           grid above it and a tab bar below. */
        <View className="items-center gap-2 py-2">
          <Icon set="food" name="empty-plate" size={48} />
          <Text variant="meta">{t('calendar.dayEmpty')}</Text>
        </View>
      ) : (
        // In the order the day happened, which is the opposite of the diary's
        // own list. That one leads with the newest because the thing somebody
        // looks at right after logging is the thing they just logged; nobody is
        // logging into a day they went to the calendar to read.
        [...entries]
          .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
          .map((entry) => (
            <ItemRow
              key={entry.id}
              title={entry.foodName}
              icon={entry.icon}
              photoPath={entry.photoPath}
              photoUri={entry.localPhotoUri}
              value={entry.macros.kcal}
              unit="kcal"
              detail={`${format(parseISO(entry.loggedAt), 'h:mm a')} · ${portionLabel(
                entry.quantity,
                entry.servingLabel,
                t('detail.servingWord'),
              )}`}
              onPress={() => onPressEntry(entry)}
            />
          ))
      )}
    </Card>
  )
}
