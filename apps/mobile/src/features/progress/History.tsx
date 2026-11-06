import { format, parseISO, subDays } from 'date-fns'
import { router } from 'expo-router'
import { type ReactNode, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  dateKey,
  ENTRY_FOOD_ID,
  type Entry,
  type HistoryMetric,
  useSelectedDate,
  type WaterDay,
  type WeightReading,
} from '@/data'
import { formatTime, ItemRow } from '@/features/shared'
import { datePattern } from '@/lib/dates'
import { eatenQuantity, portionLabel } from '@/lib/portions'
import { showChange, showWeight, UNIT_KEY, type WeightUnit } from '@/lib/units'
import { volume, waterProgress } from '@/lib/water'
import { Badge, cn, Icon, ProgressBar, Tappable, Text } from '@/ui'

/** The three lists `/history` switches between, in the order its tabs read. */
export const HISTORY_METRICS = [
  'calories',
  'water',
  'weight',
] as const satisfies readonly HistoryMetric[]

/**
 * "Today", "Yesterday", then the date, with the year only when it is not this
 * one: on a list that mostly reads the last few weeks a year is noise, and on
 * the one reading from last December it is the whole answer.
 */
export function useDayName() {
  const { t } = useTranslation('common')
  // The app's today rather than the clock's, so a list open across midnight
  // agrees with the diary about which day "Today" is. See `selected-date.tsx`.
  const { todayKey } = useSelectedDate()

  return useCallback(
    (date: string) =>
      date === todayKey
        ? t('date.today')
        : date === dateKey(subDays(parseISO(todayKey), 1))
          ? t('date.yesterday')
          : format(
              parseISO(date),
              datePattern(
                date.slice(0, 4) === todayKey.slice(0, 4) ? 'weekdayDayMonth' : 'dayMonthYear',
              ),
            ),
    [t, todayKey],
  )
}

/**
 * Opens a logged meal.
 *
 * The meal's day travels with it. The detail screen otherwise looks for the
 * entry on the diary's selected day, and moving that day to reach an old meal
 * left the diary on it afterwards, so the next meal logged from the nav bar's
 * "+" was filed twelve days ago.
 */
export function useOpenEntry() {
  return useCallback((entry: Entry) => {
    router.push({
      pathname: '/log/food/[id]',
      params: { id: entry.foodId ?? ENTRY_FOOD_ID, entryId: entry.id, date: entry.logDate },
    })
  }, [])
}

/**
 * Opens a day on Today, for a row that is a whole day rather than an entry.
 *
 * `dismissTo` rather than `navigate`: from the History screen a navigate pushed
 * a second copy of the tabs on top of it, with no way back. From the Trends
 * card it is a tab switch either way.
 */
export function useOpenDay() {
  const { setSelectedDate } = useSelectedDate()

  return useCallback(
    (date: string) => {
      setSelectedDate(date)
      router.dismissTo('/(tabs)/today')
    },
    [setSelectedDate],
  )
}

/**
 * A day's heading inside a list card: the day, and what it came to.
 *
 * A tinted band rather than an overline, so the eye finds where one day stops
 * without reading. The total is the day's, not the rows', which is why meal
 * pages always end on a whole day.
 */
export function DayBand({ label, total }: { label: string; total?: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3 rounded-sm bg-track px-3 py-1.5">
      <Text variant="caption" className="min-w-0 shrink text-body" numberOfLines={1}>
        {label}
      </Text>
      {total ? <Text variant="caption">{total}</Text> : null}
    </View>
  )
}

/** One meal, as the diary draws it: the plate, when, how much, and its calories. */
export function MealRow({ entry, onPress }: { entry: Entry; onPress: (entry: Entry) => void }) {
  const { t } = useTranslation(['logging', 'common'])

  return (
    <ItemRow
      title={entry.foodName}
      icon={entry.icon}
      photoPath={entry.photoPath}
      value={entry.macros.kcal}
      unit={t('common:unit.kcal')}
      detail={`${formatTime(entry.loggedAt)} · ${portionLabel(
        eatenQuantity(entry),
        entry.servingLabel,
        t('logging:detail.servingWord'),
      )}`}
      compact
      onPress={() => onPress(entry)}
    />
  )
}

/**
 * One day's water: the total, and a bar against that day's goal.
 *
 * A bar rather than a percentage, because "80%" is a number to work out and a
 * bar four fifths full is not. A met goal says so in words as well, so the row
 * does not depend on reading the colour of a full bar.
 */
export function WaterRow({
  day,
  dayName,
  onPress,
}: {
  day: WaterDay
  dayName: string
  onPress: (date: string) => void
}) {
  const { t } = useTranslation(['progress', 'common'])
  const amount = volume(day.ml)
  const value = t(`common:volume.${amount.unit}`, { value: amount.value })
  const met = day.ml >= day.goal

  return (
    <Tappable
      className="flex-row items-center gap-3"
      onPress={() => onPress(day.date)}
      accessibilityRole="button"
      // A full bar is the mark of a day that met the goal, so the words are
      // said to a screen reader and not drawn.
      accessibilityLabel={[value, dayName, met ? t('progress:history.goalMet') : null]
        .filter(Boolean)
        .join(', ')}
    >
      <Tile tone="water">
        <Icon set="body" name="water-drop" size={30} />
      </Tile>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="bodyStrong" numberOfLines={1}>
          {value}
        </Text>
        <Text variant="meta" numberOfLines={1}>
          {dayName}
        </Text>
      </View>
      <View className="w-[38%] items-end gap-1.5">
        <ProgressBar
          value={waterProgress(day.ml, day.goal)}
          tone="water"
          height={8}
          // A list of bars all growing at once on every scroll reads as a
          // loading state rather than a record.
          animateOnMount={false}
          className="w-full"
        />
      </View>
    </Tappable>
  )
}

/**
 * One weigh-in: the reading, the day and where it came from, and how far it
 * moved since the last one. Down is pandan and up is kaya, as on the chart.
 */
export function WeightRow({
  reading,
  dayName,
  unit,
  onPress,
}: {
  reading: WeightReading
  dayName: string
  unit: WeightUnit
  onPress: (date: string) => void
}) {
  const { t } = useTranslation(['progress', 'activity', 'common'])
  const unitLabel = t(UNIT_KEY[unit])
  const value = t('progress:weight.reading', {
    value: showWeight(reading.kg, unit),
    unit: unitLabel,
  })
  const source = reading.provider ? t(`activity:provider.${reading.provider}`) : null
  const change =
    reading.change === null ? t('progress:weight.firstReading') : showChange(reading.change, unit)

  return (
    <Tappable
      className="flex-row items-center gap-3"
      onPress={() => onPress(reading.date)}
      accessibilityRole="button"
      accessibilityLabel={[value, dayName, source, change].filter(Boolean).join(', ')}
    >
      <Tile>
        <Icon set="body" name="weighing-scale" size={30} />
      </Tile>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="bodyStrong" numberOfLines={1}>
          {value}
        </Text>
        <Text variant="meta" numberOfLines={1}>
          {source ? `${dayName} · ${source}` : dayName}
        </Text>
      </View>
      {reading.change === null ? (
        <Badge tone="neutral" size="sm" className="self-center">
          {change}
        </Badge>
      ) : (
        <Badge tone={reading.change > 0 ? 'kaya' : 'pandan'} size="sm" className="self-center">
          {`${change} ${unitLabel}`}
        </Badge>
      )}
    </Tappable>
  )
}

/** The square a row's picture sits in, the size of a compact `ItemRow` tile. */
function Tile({ tone, children }: { tone?: 'water'; children: ReactNode }) {
  return (
    <View
      className={cn(
        'h-[48px] w-[48px] items-center justify-center rounded-sm',
        tone === 'water' ? 'bg-water-soft' : 'bg-track',
      )}
    >
      {children}
    </View>
  )
}

/** The hairline every list card in the app puts between rows. */
export function RowGap({ first, children }: { first: boolean; children: ReactNode }) {
  return <View className={cn('py-2.5', !first && 'border-track border-t-2')}>{children}</View>
}
