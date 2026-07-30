import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { TrendBucket, TrendRange, TrendSummary } from '@/data'
import { Badge, Card, EmptyState, Icon, Text, WaterTracker } from '@/ui'
import { bucketLabels, SPAN_KEY } from './axis'
import { CountRow } from './CountRow'
import { CupBars } from './CupBars'
import { StatTrio } from './StatTrio'

export type WaterPanelProps = {
  range: TrendRange
  buckets: readonly TrendBucket[]
  summary: TrendSummary | null
}

/**
 * Where a day stops counting as a day you drank.
 *
 * Three quarters of the goal, not a fixed six. The design writes "Days at 6 cups
 * or more" against a goal of eight, and hard-coding the six would make the habit
 * card say something different from what it measures the moment somebody sets
 * their goal to twelve.
 */
const HABIT_SHARE = 0.75

/**
 * T3 / T7 / T10 — the water tab.
 *
 * The chart is the tab's whole argument: a water column's height is the GOAL,
 * every time, and what varies is how much of it is filled. See `CupBars`.
 *
 * The third card is the one that changes with the range. At seven days it shows
 * today, because today is still fixable — three cups to go is an instruction. At
 * thirty days and a year that is noise inside the window, so it becomes the
 * habit: how many days cleared the bar at all.
 */
export function WaterPanel({ range, buckets, summary }: WaterPanelProps) {
  const { t } = useTranslation(['progress', 'common', 'logging'])

  /**
   * "6.1 cups" for an average, "34 cups" for a total.
   *
   * An average always keeps its decimal even when it lands on a whole number,
   * so it reads as the same figure as the tile above it rather than as a count.
   */
  const cupsAvg = (value: number) => t('progress:water.cups', { value: value.toFixed(1) })
  const cupsCount = (value: number) =>
    t('progress:water.cups', { value: String(Math.round(value)) })

  const labels = bucketLabels(buckets, range, (index) => t('progress:range.week', { index }))
  const goal = summary?.waterGoal ?? 8
  const habitFloor = Math.max(1, Math.round(goal * HABIT_SHARE))

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

  // The last bucket of a seven-day range IS today, so today's count is already
  // in hand — no second query for a card that only appears on that range.
  const todayCups = buckets.at(-1)?.waterTotal ?? 0
  const toGo = Math.max(0, goal - todayCups)

  /**
   * The habit card counts MONTHS on the year view and DAYS everywhere else, and
   * they come from different places for a reason.
   *
   * "Months averaging 6+" is a question about the twelve columns on screen, so
   * it is answered from them. "Days at 6 cups or more" is a question about
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
          { key: 'avg', label: t('progress:water.yearAverage'), value: cupsAvg(summary.water) },
          {
            key: 'best',
            label: t('progress:water.bestMonth'),
            value: cupsAvg(bestBucket(buckets)),
          },
          { key: 'total', label: t('progress:water.total'), value: cupsCount(summary.waterTotal) },
        ]
      : [
          {
            key: 'goal',
            label: t('progress:water.goalDays'),
            value: t('progress:ofDays', { done: summary.waterGoalDays, total: summary.days }),
          },
          { key: 'best', label: t('progress:water.bestDay'), value: cupsCount(summary.waterBest) },
          { key: 'total', label: t('progress:water.total'), value: cupsCount(summary.waterTotal) },
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
                ? t('progress:water.cupNote')
                : range === '30d'
                  ? t('progress:water.cupNoteWeekly')
                  : t('progress:water.cupNoteMonthly')}
            </Text>
          </View>

          <Badge tone="water" className="px-3 py-2">
            <Icon set="body" name="water-drop" size={17} />
            <Text variant="caption" className="text-water-ink" numberOfLines={1}>
              {t('progress:water.goalPill', { goal })}
            </Text>
          </Badge>
        </View>

        <CupBars
          bars={buckets.map((bucket, index) => ({
            key: bucket.start,
            label: labels[index],
            // Rounded, because a segment is one cup and there is no half a cup
            // to draw. An average of 7.6 across a week fills eight.
            cups: Math.round(bucket.water),
            reached: Math.round(bucket.water) >= goal,
          }))}
          goal={goal}
          accessibilityLabel={t('progress:water.chart', { goal })}
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
              {toGo === 0 ? t('progress:water.goalMet') : t('progress:water.toGo', { count: toGo })}
            </Text>
          }
        >
          {/* No `onChange`. The glasses are tappable on Today, where the day is
              the subject; here they are a reading of it, and a chart you can
              edit by brushing it is a chart nobody trusts. */}
          <WaterTracker
            filled={todayCups}
            goal={goal}
            glassLabel={(ordinal, total) => t('logging:water.glass', { ordinal, total })}
          />
          <Text variant="meta">{t('progress:water.todayCount', { filled: todayCups, goal })}</Text>
        </Card>
      ) : (
        <Card title={t('progress:water.habitTitle')}>
          <CountRow
            label={
              range === '1y'
                ? t('progress:water.monthsAveraging', { cups: habitFloor })
                : t('progress:water.daysAtLeast', { cups: habitFloor })
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
