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
  type MealDay,
  useHistory,
  useSelectedDate,
  type WaterDay,
  type WeightReading,
} from '@/data'
import { formatTime, ItemRow } from '@/features/shared'
import { datePattern } from '@/lib/dates'
import { eatenQuantity, portionLabel } from '@/lib/portions'
import { showChange, showWeight, UNIT_KEY, type WeightUnit } from '@/lib/units'
import { volume, waterProgress } from '@/lib/water'
import { useThemeColors } from '@/theme/useTheme'
import { Badge, Card, cn, Icon, ProgressBar, Skeleton, Tappable, Text } from '@/ui'

/** Rows the Trends card shows before "See all". Enough to recognise a day. */
const PREVIEW_ROWS = 5

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
 * Opens a logged meal, on its own day.
 *
 * The detail screen finds the entry in the diary's selected day, which is the
 * only day it loads, so the diary moves to the meal's day first. That is the
 * same thing the month calendar does with a tapped day: the history is a way
 * back into the diary rather than a second copy of it.
 */
export function useOpenEntry() {
  const { selectedDate, setSelectedDate } = useSelectedDate()

  return useCallback(
    (entry: Entry) => {
      if (entry.logDate !== selectedDate) setSelectedDate(entry.logDate)
      router.push({
        pathname: '/log/food/[id]',
        params: { id: entry.foodId ?? ENTRY_FOOD_ID, entryId: entry.id },
      })
    },
    [selectedDate, setSelectedDate],
  )
}

/** Opens a day on Today, for a row that is a whole day rather than an entry. */
export function useOpenDay() {
  const { setSelectedDate } = useSelectedDate()

  return useCallback(
    (date: string) => {
      setSelectedDate(date)
      router.navigate('/(tabs)/today')
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
        {met ? (
          <View className="flex-row items-center gap-1">
            <Icon set="ui" name="check" size={14} />
            <Text variant="micro" className="text-pandan-ink">
              {t('progress:history.goalMet')}
            </Text>
          </View>
        ) : null}
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

export type HistoryCardProps = {
  metric: HistoryMetric
  unit: WeightUnit
  /** Opens the weigh-in sheet on a day. Only the weight card's rows use it. */
  onEditWeight?: (date: string) => void
  /** Opposite the heading. The weight card's "Add". */
  action?: ReactNode
}

/**
 * The newest few entries under a Trends tab, and the way into all of them.
 *
 * The charts say what a range came to; this says what it was made of. It is
 * not bounded by the range above it: the newest entries are the ones somebody
 * checks, whichever range is drawn, and the whole list is one tap away.
 */
export function HistoryCard({ metric, unit, onEditWeight, action }: HistoryCardProps) {
  const { t } = useTranslation(['progress'])
  const history = useHistory(metric)
  const dayName = useDayName()
  const openEntry = useOpenEntry()
  const openDay = useOpenDay()
  const colors = useThemeColors()

  // Nothing ever logged: the panel above already says so, in its own words.
  if (history.isSuccess && history.items.length === 0) return null

  let rows: ReactNode[] = []
  if (metric === 'calories') {
    let left = PREVIEW_ROWS
    for (const day of history.items as MealDay[]) {
      if (left <= 0) break
      const shown = day.entries.slice(0, left)
      left -= shown.length
      rows.push(
        <View key={day.date} className="gap-0 pt-2">
          <DayBand
            label={dayName(day.date)}
            total={t('progress:history.dayTotal', { value: day.kcal.toLocaleString() })}
          />
          {shown.map((entry, index) => (
            <RowGap key={entry.id} first={index === 0}>
              <MealRow entry={entry} onPress={openEntry} />
            </RowGap>
          ))}
        </View>,
      )
    }
  } else if (metric === 'water') {
    rows = (history.items as WaterDay[]).slice(0, PREVIEW_ROWS).map((day, index) => (
      <RowGap key={day.date} first={index === 0}>
        <WaterRow day={day} dayName={dayName(day.date)} onPress={openDay} />
      </RowGap>
    ))
  } else {
    rows = (history.items as WeightReading[]).slice(0, PREVIEW_ROWS).map((reading, index) => (
      <RowGap key={reading.date} first={index === 0}>
        <WeightRow
          reading={reading}
          dayName={dayName(reading.date)}
          unit={unit}
          onPress={(date) => onEditWeight?.(date)}
        />
      </RowGap>
    ))
  }

  return (
    <Card contentClassName="gap-0 px-4 pb-1 pt-4">
      {/* No hairline under the heading, unlike the diary's list: the first day
          band is already the line, and both read as a double rule. */}
      <View className="min-h-sm flex-row items-center justify-between gap-3 pb-1">
        <Text variant="subtitle" className="shrink" numberOfLines={1}>
          {t('progress:history.title')}
        </Text>
        {action}
      </View>

      {history.unavailable ? (
        // A line rather than a vanished card: a card that silently goes on a
        // failed request reads as "you have never logged anything".
        <Text variant="meta" className="py-3">
          {t('progress:history.failed')}
        </Text>
      ) : history.items.length === 0 ? (
        <View className="gap-3 py-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </View>
      ) : (
        rows
      )}

      <Tappable
        className="flex-row items-center justify-center gap-1 border-track border-t-2 py-3"
        onPress={() => router.push({ pathname: '/history', params: { metric } })}
        accessibilityRole="button"
      >
        <Text variant="label" className="text-pandan-ink">
          {t('progress:history.seeAll')}
        </Text>
        <Icon set="ui" name="chevron-right" size={16} tintColor={colors.pandanInk} />
      </Tappable>
    </Card>
  )
}
