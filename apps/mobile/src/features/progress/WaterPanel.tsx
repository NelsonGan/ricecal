import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { TrendBucket, TrendRange, TrendSummary } from '@/data'
import { DEFAULT_WATER_ML, volume, waterProgress } from '@/lib/water'
import { Badge, Card, EmptyState, Icon, Text, WaterTank } from '@/ui'
import { bucketLabels, SPAN_KEY } from './axis'
import { CountRow } from './CountRow'
import { StatTrio } from './StatTrio'
import { WaterColumns } from './WaterColumns'

export type WaterPanelProps = {
  range: TrendRange
  buckets: readonly TrendBucket[]
  summary: TrendSummary | null
}

/**
 * Where a day stops counting as a day you drank.
 *
 * Three quarters of the goal rather than a figure of its own, so the line moves
 * with the goal: the habit card would otherwise say something different from
 * what it measures the moment somebody sets their goal to three litres. THE
 * SAME SHARE `trend_summary` FILTERS ON — see the note beside `habitFloor`.
 */
const HABIT_SHARE = 0.75

/**
 * T3 / T7 / T10 — the water tab.
 *
 * The chart is the tab's whole argument: a water column's height is the GOAL,
 * every time, and what varies is how much of it is filled. See `WaterColumns`.
 *
 * The third card is the one that changes with the range. At seven days it shows
 * today, because today is still fixable — half a litre to go is an instruction. At
 * thirty days and a year that is noise inside the window, so it becomes the
 * habit: how many days cleared the bar at all.
 */
export function WaterPanel({ range, buckets, summary }: WaterPanelProps) {
  const { t } = useTranslation(['progress', 'common', 'logging'])

  /** A volume as its figure and unit: "1.8 L" above a litre, "750 ml" below. */
  const amount = (value: number) => {
    const { value: shown, unit } = volume(value)
    return t(`common:volume.${unit}`, { value: shown })
  }

  const labels = bucketLabels(buckets, range, (index) => t('progress:range.week', { index }))

  // `||`, not `??`, and deliberately: `water_goal` comes back through `orZero`,
  // so a range with no goal row in it reads as 0 rather than as null — and a
  // goal of zero is a chart whose columns are all full.
  const goal = summary?.waterGoal || DEFAULT_WATER_ML

  // `ceil`, matching `trend_summary` EXACTLY. The count under this label is the
  // database's, so any tidier arithmetic here — rounding to the nearest 250,
  // say — puts a threshold on the card that is not the one being counted: a
  // 2,500 ml goal would be labelled "2 L or more" over a count of days above
  // 1,875. Display rounding is `volume`'s business and is a different thing.
  const habitFloor = Math.ceil(goal * HABIT_SHARE)

  if (!summary || summary.waterTotal === 0) {
    return (
      <Card>
        <EmptyState
          title={t('progress:water.emptyTitle')}
          description={t('progress:water.emptyBody')}
          icon={{ set: 'body', name: 'water-drop' }}
        />
      </Card>
    )
  }

  // The last bucket of a seven-day range IS today, so today's figure is already
  // in hand — no second query for a card that only appears on that range.
  const todayMl = buckets.at(-1)?.waterTotal ?? 0
  const toGo = Math.max(0, goal - todayMl)

  /**
   * The habit card counts MONTHS on the year view and DAYS everywhere else, and
   * they come from different places for a reason.
   *
   * "Months averaging 6+" is a question about the twelve columns on screen, so
   * it is answered from them. "Days at 1.5 L or more" is a question about
   * thirty days, and the thirty-day view's columns are weeks — asking whether
   * each week AVERAGED above the line reported "0 of 30" for a month with
   * several full days in it, which is not a rounding error. That count comes
   * from `trend_summary`, which still has the days.
   */
  const habit =
    range === '1y'
      ? {
          done: buckets.filter((bucket) => bucket.water >= habitFloor).length,
          total: buckets.length,
        }
      : { done: summary.waterHabitDays, total: summary.days }

  const logged =
    range === '1y'
      ? {
          done: buckets.filter((bucket) => bucket.waterLoggedDays > 0).length,
          total: buckets.length,
        }
      : { done: summary.waterLoggedDays, total: summary.days }

  const stats =
    range === '1y'
      ? [
          { key: 'avg', label: t('progress:water.yearAverage'), value: amount(summary.water) },
          {
            key: 'best',
            label: t('progress:water.bestMonth'),
            value: amount(bestBucket(buckets)),
          },
          { key: 'total', label: t('progress:water.total'), value: amount(summary.waterTotal) },
        ]
      : [
          {
            key: 'goal',
            label: t('progress:water.goalDays'),
            value: t('progress:ofDays', { done: summary.waterGoalDays, total: summary.days }),
          },
          { key: 'best', label: t('progress:water.bestDay'), value: amount(summary.waterBest) },
          { key: 'total', label: t('progress:water.total'), value: amount(summary.waterTotal) },
        ]

  return (
    <>
      <Card>
        <View className="flex-row items-end justify-between gap-md">
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="label" className="text-heading">
              {t(SPAN_KEY[range])}
            </Text>
            <Text variant="meta" numberOfLines={2}>
              {range === '7d'
                ? t('progress:water.dayNote')
                : range === '30d'
                  ? t('progress:water.weeklyNote')
                  : t('progress:water.monthlyNote')}
            </Text>
          </View>

          <Badge tone="water" className="px-3 py-2">
            <Icon set="body" name="water-drop" size={17} />
            <Text variant="caption" className="text-water-ink" numberOfLines={1}>
              {t('progress:water.goalPill', { amount: amount(goal) })}
            </Text>
          </Badge>
        </View>

        <WaterColumns
          columns={buckets.map((bucket, index) => ({
            key: bucket.start,
            label: labels[index],
            filled: waterProgress(bucket.water, goal),
            reached: bucket.water >= goal,
          }))}
          accessibilityLabel={t('progress:water.chart', { amount: amount(goal) })}
        />

        {range === '7d' ? (
          <View className="flex-row flex-wrap gap-md">
            <View className="flex-row items-center gap-1.5">
              <View className="h-2.5 w-2.5 rounded-[3px] bg-water" />
              <Text variant="caption">{t('progress:water.reached')}</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="h-2.5 w-2.5 rounded-[3px] border border-dashed border-water-soft-line bg-water-soft" />
              <Text variant="caption">{t('progress:water.short')}</Text>
            </View>
          </View>
        ) : null}
      </Card>

      <Card>
        <StatTrio stats={stats} />
      </Card>

      {range === '7d' ? (
        <Card
          title={t('progress:water.todayTitle')}
          action={
            <Text variant="label" className={toGo === 0 ? 'text-pandan-ink' : 'text-water-ink'}>
              {toGo === 0
                ? t('progress:water.goalMet')
                : t('progress:water.toGo', { amount: amount(toGo) })}
            </Text>
          }
        >
          {/* The same glass Today draws, and nothing to press. Water is
              recorded where the day is the subject; here it is a reading of the
              range, and a chart you can edit by brushing it is a chart nobody
              trusts. */}
          <View className="gap-md">
            <WaterTank
              value={todayMl}
              goal={goal}
              accessibilityLabel={t('logging:water.level', {
                filled: amount(todayMl),
                goal: amount(goal),
              })}
            />
            <Text variant="meta">
              {t('progress:water.todayCount', { filled: amount(todayMl), goal: amount(goal) })}
            </Text>
          </View>
        </Card>
      ) : (
        <Card title={t('progress:water.habitTitle')}>
          <CountRow
            label={
              range === '1y'
                ? t('progress:water.monthsAveraging', { amount: amount(habitFloor) })
                : t('progress:water.daysAtLeast', { amount: amount(habitFloor) })
            }
            done={habit.done}
            total={habit.total}
            caption={t('progress:ofDays', { done: habit.done, total: habit.total })}
          />
          <CountRow
            label={
              range === '1y' ? t('progress:water.monthsLogged') : t('progress:water.daysLogged')
            }
            done={logged.done}
            total={logged.total}
            caption={t('progress:ofDays', { done: logged.done, total: logged.total })}
          />
        </Card>
      )}
    </>
  )
}

/** The fullest bucket's daily average — "best month", not "best day of the year". */
function bestBucket(buckets: readonly TrendBucket[]) {
  return buckets.reduce((best, bucket) => Math.max(best, bucket.water), 0)
}
