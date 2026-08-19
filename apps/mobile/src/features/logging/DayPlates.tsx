import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { ScrollView, View } from 'react-native'

import type { Entry } from '@/data'
import { storedImageSource, useMealPhotoUrl } from '@/data'
import { sumMacros } from '@/lib/nutrition'
import { Card, Icon, Skeleton, Tappable, Text } from '@/ui'
import { MealPhoto } from '../shared/MealPhoto'

/** The same stand-in the grid above uses. See `MonthCalendar`. */
const PLACEHOLDER_ICON = { set: 'food', name: 'empty-plate' } as const

function Plate({ entry, onPress }: { entry: Entry; onPress: () => void }) {
  const { data: photoUrl, isLoading: resolving } = useMealPhotoUrl(entry.photoPath)
  const photo = storedImageSource(entry.photoPath, photoUrl, entry.localPhotoUri)

  return (
    <Tappable
      className="w-[72px] gap-1.5"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${entry.foodName}, ${entry.macros.kcal} kcal, ${format(
        parseISO(entry.loggedAt),
        'h:mm a',
      )}`}
    >
      <View className="h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-tile bg-track">
        {photo ? (
          <MealPhoto source={photo} />
        ) : resolving && entry.photoPath ? (
          <Skeleton width="100%" height={72} rounded={false} className="bg-line" />
        ) : (
          <Icon {...(entry.icon ?? PLACEHOLDER_ICON)} size={44} />
        )}
      </View>
      <Text variant="numeric" className="text-center text-[16px] leading-[20px]">
        {entry.macros.kcal.toLocaleString()}
      </Text>
      <Text variant="micro" className="text-center">
        {format(parseISO(entry.loggedAt), 'h:mm a')}
      </Text>
    </Tappable>
  )
}

export type DayPlatesProps = {
  date: string
  entries: Entry[]
  loading?: boolean
  onPressEntry: (entry: Entry) => void
  className?: string
}

/**
 * The day the calendar has selected, as a row of its plates.
 *
 * Pictures rather than the diary's own list, and that is the point rather than
 * a shorthand for it: the grid above is read by looking, so the thing under it
 * has to be readable the same way. A full `EntryList` here would be the day
 * view drawn underneath the month view, and the screen would be saying the same
 * thing twice in two registers.
 *
 * It SCROLLS SIDEWAYS, because a day is not four meals. Four is what fits, and
 * a day of snacks is nine — wrapped to a second line it would push the grid off
 * the top of the screen on exactly the days worth looking at.
 *
 * Each plate still opens its entry, so nothing about the diary is unreachable
 * from here.
 */
export function DayPlates({
  date,
  entries,
  loading = false,
  onPressEntry,
  className,
}: DayPlatesProps) {
  const { t } = useTranslation('logging')
  const total = sumMacros(entries)

  return (
    <Card
      className={className}
      title={t('calendar.dayHeading', {
        day: format(parseISO(date), 'EEEE d'),
        count: entries.length,
      })}
      action={
        entries.length > 0 ? (
          <Text variant="numeric" className="text-[16px] leading-[20px]">
            {t('calendar.dayKcal', { kcal: total.kcal.toLocaleString() })}
          </Text>
        ) : undefined
      }
    >
      {loading ? (
        <View className="flex-row gap-3">
          <Skeleton className="h-[72px] w-[72px]" />
          <Skeleton className="h-[72px] w-[72px]" />
        </View>
      ) : entries.length === 0 ? (
        <Text variant="meta">{t('calendar.dayEmpty')}</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // The card's own padding, given back to the row so the first plate
          // starts at the gutter and the last one can scroll clear of it.
          className="-mx-card"
          contentContainerClassName="gap-3 px-card"
        >
          {entries.map((entry) => (
            <Plate key={entry.id} entry={entry} onPress={() => onPressEntry(entry)} />
          ))}
        </ScrollView>
      )}
    </Card>
  )
}
