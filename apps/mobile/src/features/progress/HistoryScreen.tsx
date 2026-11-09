import { format } from 'date-fns/format'
import { parseISO } from 'date-fns/parseISO'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  type HistoryMetric,
  type MealDay,
  today,
  useHistory,
  useSettings,
  useTrimHistoryOnLeave,
  useUpdateSettings,
  type WaterDay,
  type WeightReading,
} from '@/data'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { ReplayMask } from '@/lib/replay-mask'
import { showChange, UNIT_KEY, unitFor, type WeightUnit } from '@/lib/units'
import { volume } from '@/lib/water'
import { radius, spacing } from '@/theme/tokens'
import {
  AppBar,
  Button,
  Card,
  EmptyState,
  Icon,
  Screen,
  Skeleton,
  Spinner,
  Squish,
  Text,
} from '@/ui'
import {
  MealRow,
  RowGap,
  useDayName,
  useOpenDay,
  useOpenEntry,
  WaterRow,
  WeightRow,
} from './History'
import { WeighInSheet } from './WeighInSheet'

/** One card on the page: a heading, a figure beside it, and its rows. */
type Group = { key: string; title: string; figure?: string; rows: ReactNode[] }

/** Each page's name, as a map so a renamed key is a compile error. */
const TITLE_KEY = {
  calories: 'progress:history.caloriesTitle',
  water: 'progress:history.waterTitle',
  weight: 'progress:history.weightTitle',
} as const satisfies Record<HistoryMetric, string>

/**
 * Everything behind one Trends card, newest first, read like a statement.
 *
 * One page per metric, opened from that card's heading, rather than one page
 * with tabs: somebody who tapped the weight card came for weigh-ins, and a tab
 * strip over them was a second way to arrive somewhere they had already
 * chosen. The weight page carries the Add button, which is where a missing
 * reading is noticed.
 *
 * Meals come one card per day, with the day's total on the heading, because a
 * day is what the diary and the calorie chart both count in. Water and weight
 * are already one row per day, so a day each would be a card per row; they come
 * a month to a card instead.
 *
 * A list rather than the screen's usual scroll view: a year of meals is a
 * thousand rows, and only the cards on screen should be drawn.
 */
export function HistoryScreen({ metric }: { metric: HistoryMetric }) {
  const { t } = useTranslation(['progress', 'common'])
  const back = useBack('/(tabs)/trends')
  const insets = useSafeAreaInsets()
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
          title={t(TITLE_KEY[metric])}
          onBack={back}
          backLabel={t('common:action.back')}
          action={
            metric === 'weight' ? <WeighInPill onPress={() => setWeighingIn(today())} /> : undefined
          }
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
          // Weigh-ins are kept out of replays: a weight may come from Apple Health
          // or Health Connect. The calorie and water histories stay visible.
          <ReplayMask enabled={metric === 'weight'}>
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
          </ReplayMask>
        )}
        ItemSeparatorComponent={Gap}
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

/**
 * The way to add a reading, in the weight history's bar, over the list where
 * somebody notices one is missing. A pill rather than a full-width button.
 */
function WeighInPill({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation('progress')

  return (
    <Squish
      depth={0}
      radius={radius.full}
      slabClassName="bg-transparent"
      className="min-h-sm flex-row items-center gap-1.5 bg-track px-3"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('weight.sheetTitle')}
    >
      <Icon set="ui" name="plus" size={15} />
      {/* `label` rather than the display face at 15px. Baloo carries ascender
          space this string does not use, so centring the two boxes left the
          word sitting visibly below the icon beside it. */}
      <Text variant="label" className="text-pandan-ink">
        {t('weight.add')}
      </Text>
    </Squish>
  )
}
