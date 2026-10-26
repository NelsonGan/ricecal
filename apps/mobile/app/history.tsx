import { format, parseISO } from 'date-fns'
import { useLocalSearchParams } from 'expo-router'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  type HistoryMetric,
  type MealDay,
  useHistory,
  useSettings,
  useTrimHistoryOnLeave,
  useUpdateSettings,
  type WaterDay,
  type WeightReading,
} from '@/data'
import {
  MealRow,
  RowGap,
  TREND_METRICS,
  useDayName,
  useOpenDay,
  useOpenEntry,
  WaterRow,
  WeighInSheet,
  WeightRow,
} from '@/features/progress'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { SessionGate } from '@/lib/SessionGate'
import { showChange, UNIT_KEY, unitFor, type WeightUnit } from '@/lib/units'
import { volume } from '@/lib/water'
import { spacing } from '@/theme/tokens'
import {
  AppBar,
  Button,
  Card,
  EmptyState,
  Screen,
  SegmentedControl,
  Skeleton,
  Spinner,
  Text,
} from '@/ui'

/** One card on the page: a heading, a figure beside it, and its rows. */
type Group = { key: string; title: string; figure?: string; rows: ReactNode[] }

const asMetric = (value: string | undefined): HistoryMetric =>
  TREND_METRICS.includes(value as HistoryMetric) ? (value as HistoryMetric) : 'calories'

/**
 * Everything behind the Trends charts, newest first, read like a statement.
 *
 * Meals come one card per day, with the day's total on the heading, because a
 * day is what the diary and the calorie chart both count in. Water and weight
 * are already one row per day, so a day each would be a card per row; they come
 * a month to a card instead.
 *
 * A list rather than the screen's usual scroll view: a year of meals is a
 * thousand rows, and only the cards on screen should be drawn.
 */
export default function HistoryRoute() {
  return (
    <SessionGate>
      <HistoryScreen />
    </SessionGate>
  )
}

function HistoryScreen() {
  const { t } = useTranslation(['progress', 'common'])
  const back = useBack('/(tabs)/trends')
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ metric?: string }>()
  const [metric, setMetric] = useState(() => asMetric(params.metric))
  // A link into a History screen that is already open reuses it with new
  // params, and `useState` only reads them once.
  useEffect(() => {
    if (params.metric) setMetric(asMetric(params.metric))
  }, [params.metric])
  /** Which day the weigh-in sheet is on, and null when it is shut. */
  const [weighingIn, setWeighingIn] = useState<string | null>(null)

  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const unit = unitFor(settings?.units)

  useTrimHistoryOnLeave()
  const history = useHistory(metric)
  const groups = useGroups(metric, history.items, unit, setWeighingIn)

  /**
   * The end of the list was reached while a refetch was out. Asking for the next
   * page then would cancel the refetch, and not asking left the list stopped
   * until somebody scrolled again, so the request waits for the refetch.
   */
  const wantsMore = useRef(false)
  const loadMore = () => {
    if (!history.hasNextPage || history.isFetchNextPageError) return
    if (history.isFetching) {
      wantsMore.current = true
      return
    }
    wantsMore.current = false
    void history.fetchNextPage()
  }
  const { isFetching } = history
  useEffect(() => {
    if (!isFetching && wantsMore.current) loadMore()
  })

  return (
    <Screen
      header={
        <AppBar
          title={t('progress:history.title')}
          onBack={back}
          backLabel={t('common:action.back')}
        />
      }
      scroll={false}
      flush
    >
      <FlatList
        // The groups whenever there are any. A failed refetch or a failed next
        // page leaves the loaded pages in the cache, and blanking them for an
        // error message threw away everything somebody had scrolled through.
        data={groups}
        keyExtractor={(group) => group.key}
        renderItem={({ item }) => (
          <Card contentClassName="gap-0 px-4 pb-1 pt-4">
            <View className="flex-row items-center justify-between gap-3 border-track border-b-2 pb-3">
              <Text variant="subtitle" className="min-w-0 shrink" numberOfLines={1}>
                {item.title}
              </Text>
              {item.figure ? (
                <Text variant="label" className="text-muted">
                  {item.figure}
                </Text>
              ) : null}
            </View>
            {item.rows}
          </Card>
        )}
        ItemSeparatorComponent={Gap}
        ListHeaderComponent={
          <SegmentedControl
            options={TREND_METRICS.map((value) => ({
              value,
              label: t(`progress:metric.${value}`),
            }))}
            value={metric}
            onChange={setMetric}
            accessibilityLabel={t('progress:history.title')}
          />
        }
        ListHeaderComponentStyle={{ marginBottom: spacing.stack }}
        ListEmptyComponent={
          history.offline ? (
            <Card>
              <EmptyState
                title={t('common:offline.title')}
                description={t('common:offline.body')}
              />
            </Card>
          ) : history.failed ? (
            <Card>
              <EmptyState
                title={t('progress:history.failed')}
                action={
                  <Button variant="secondary" onPress={() => history.refetch()}>
                    {t('common:action.retry')}
                  </Button>
                }
              />
            </Card>
          ) : history.isPending ? (
            <Card>
              <Skeleton className="h-[320px] w-full" />
            </Card>
          ) : (
            <Card>
              <EmptyState
                title={t('progress:history.emptyTitle')}
                description={t('progress:history.emptyBody')}
                icon={EMPTY_ICON[metric]}
              />
            </Card>
          )
        }
        ListFooterComponent={
          history.isFetchingNextPage ? (
            <Spinner size="small" className="py-lg" />
          ) : history.isFetchNextPageError ? (
            <Button
              variant="secondary"
              className="mt-stack"
              onPress={() => history.fetchNextPage()}
            >
              {t('common:action.retry')}
            </Button>
          ) : undefined
        }
        // Not after a failure: the end is reached again on every bounce, and the
        // retry button under the list is the way to ask again.
        onEndReached={loadMore}
        onEndReachedThreshold={1.5}
        contentContainerStyle={{
          paddingHorizontal: spacing.gutter,
          paddingBottom: spacing.gutter + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
      />

      <WeighInSheet
        date={weighingIn}
        onClose={() => setWeighingIn(null)}
        unit={unit}
        onUnitChange={(next) =>
          updateSettings.mutate({ units: next === 'lb' ? 'imperial' : 'metric' })
        }
      />
    </Screen>
  )
}

/** Between cards. A component of its own so the list does not remount it. */
function Gap() {
  return <View style={{ height: spacing.stack }} />
}

const EMPTY_ICON = {
  calories: { set: 'body', name: 'flame-burn' },
  water: { set: 'body', name: 'water-drop' },
  weight: { set: 'body', name: 'weighing-scale' },
} as const

/** The loaded entries as cards: a day of meals each, or a month of days. */
function useGroups(
  metric: HistoryMetric,
  items: readonly (MealDay | WaterDay | WeightReading)[],
  unit: WeightUnit,
  onEditWeight: (date: string) => void,
): Group[] {
  const { t } = useTranslation(['progress', 'common'])
  const dayName = useDayName()
  const openEntry = useOpenEntry()
  const openDay = useOpenDay()

  return useMemo((): Group[] => {
    if (metric === 'calories') {
      return (items as MealDay[]).map((day) => ({
        key: day.date,
        title: dayName(day.date),
        figure: t('progress:history.dayTotal', { value: day.kcal.toLocaleString() }),
        rows: day.entries.map((entry, index) => (
          <RowGap key={entry.id} first={index === 0}>
            <MealRow entry={entry} onPress={openEntry} />
          </RowGap>
        )),
      }))
    }

    const months = byMonth(items as (WaterDay | WeightReading)[])

    if (metric === 'water') {
      return months.map(([month, days]) => {
        const average = volume(
          (days as WaterDay[]).reduce((sum, day) => sum + day.ml, 0) / days.length,
        )
        return {
          key: month,
          title: format(parseISO(`${month}-01`), datePattern('monthYear')),
          figure: t('progress:history.waterAverage', {
            amount: t(`common:volume.${average.unit}`, { value: average.value }),
          }),
          rows: (days as WaterDay[]).map((day, index) => (
            <RowGap key={day.date} first={index === 0}>
              <WaterRow day={day} dayName={dayName(day.date)} onPress={openDay} />
            </RowGap>
          )),
        }
      })
    }

    return months.map(([month, readings]) => {
      // How far the month moved, counted from the reading before it began, so the
      // figure is the sum of the changes listed under it.
      const changes = (readings as WeightReading[])
        .map((reading) => reading.change)
        .filter((change): change is number => change !== null)
      const moved = changes.length ? changes.reduce((sum, change) => sum + change, 0) : null
      return {
        key: month,
        title: format(parseISO(`${month}-01`), datePattern('monthYear')),
        figure: moved === null ? undefined : `${showChange(moved, unit)} ${t(UNIT_KEY[unit])}`,
        rows: (readings as WeightReading[]).map((reading, index) => (
          <RowGap key={reading.date} first={index === 0}>
            <WeightRow
              reading={reading}
              dayName={dayName(reading.date)}
              unit={unit}
              onPress={onEditWeight}
            />
          </RowGap>
        )),
      }
    })
  }, [metric, items, unit, onEditWeight, t, dayName, openEntry, openDay])
}

/** Newest month first, each holding its days in the order they came. */
function byMonth<T extends { date: string }>(items: readonly T[]): [string, T[]][] {
  const months: [string, T[]][] = []
  for (const item of items) {
    const month = item.date.slice(0, 7)
    const last = months.at(-1)
    if (last?.[0] === month) last[1].push(item)
    else months.push([month, [item]])
  }
  return months
}
