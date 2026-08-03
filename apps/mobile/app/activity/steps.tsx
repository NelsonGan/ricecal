import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  TREND_RANGES,
  type TrendRange,
  today as todayKey,
  useActivityDay,
  useActivityHours,
  useActivitySeries,
  useActivitySummary,
} from '@/data'
import {
  busiestHour,
  count,
  distance,
  HourBars,
  hasHourlyShape,
  hourLabel,
  hourlySummary,
} from '@/features/activity'
import { type Stat, StatRow } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { AppBar, Card, ProgressBar, Screen, SegmentedControl, Skeleton, Text } from '@/ui'

/**
 * A4 / N5: steps.
 *
 * Today at the top with its hourly shape, the range under it as a strip of
 * days. The range switch governs the lower half only — today is today whichever
 * window is selected, and moving it would make the top of the screen change for
 * no reason the user asked for.
 *
 * THE HOURLY CHART DEGRADES ON PURPOSE
 *
 * Samsung Health writes steps in coarse blocks rather than by the hour. Twenty
 * four columns of which three are skyscrapers reads as "you sat still all
 * morning", which is a claim about the user rather than about the recording. So
 * when there is not enough shape the same component draws three blocks instead
 * — the N5 screen in the design.
 */
export default function StepsScreen() {
  const { t } = useTranslation(['activity', 'progress', 'common'])
  const goBack = useBack('/(tabs)/activity')

  const [range, setRange] = useState<TrendRange>('7d')
  const date = todayKey()

  const day = useActivityDay(date)
  const hours = useActivityHours(date)
  const series = useActivitySeries(range)
  const summary = useActivitySummary(range)

  const goal = summary.data?.stepGoal ?? 8000
  const steps = day.data?.steps ?? 0
  const difference = steps - goal

  const hourly = hours.data ?? []
  const detailed = hasHourlyShape(hourly)
  const busiest = detailed ? busiestHour(hourly) : null

  /**
   * The chart is drawn in STEPS PER DAY, not steps per bucket.
   *
   * A bucket is one day on 7d, so there the two are the same number and nothing
   * below changes. They diverge everywhere else, and the totals were wrong in a
   * way that looked like data: on 30d the oldest column is whatever is left over
   * after the seven-day blocks — two days, 10,940 steps — drawn against 7-day
   * blocks of around 48,000, so it rendered as a 20% stub. Its per-day average
   * was 5,470 against their 6,900. The reader sees a collapse; the chart is
   * showing them the width of a bucket.
   *
   * The 1y view has it worse, because the newest column is the CURRENT month:
   * on the 3rd it is a nub beside eleven full months, which reads as "you have
   * stopped walking" on a day the user walked 8,260 steps.
   *
   * Averages are also what the stat row under the chart already reports, and
   * what `BalanceBars` has always drawn. This was the one chart in the feature
   * comparing sums of unequal things.
   */
  const perDay = (bucket: { steps: number | null; stepsTotal: number; days: number }) =>
    bucket.steps ?? (bucket.days > 0 ? bucket.stepsTotal / bucket.days : 0)

  // Hoisted out of the column loop below: it is a property of the series, not
  // of a bucket, and recomputing it per column made the chart O(n²) in its own
  // width for no reason.
  const stepsPeak = Math.max(...(series.data ?? []).map(perDay), 1)

  const stats: Stat[] = [
    {
      key: 'avg',
      label: t('activity:steps.dailyAvg'),
      value: summary.data?.steps != null ? count(summary.data.steps) : '—',
    },
    {
      key: 'goal-days',
      label: t('activity:steps.goalDays'),
      value: t('progress:ofDays', {
        done: summary.data?.stepGoalDays ?? 0,
        total: summary.data?.days ?? 0,
      }),
    },
    {
      key: 'best',
      label: t('activity:steps.best'),
      value: summary.data?.stepsBest ? count(summary.data.stepsBest) : '—',
    },
  ]

  return (
    <Screen>
      <AppBar
        title={t('activity:steps.title')}
        onBack={goBack}
        backLabel={t('common:action.back')}
        action={
          <SegmentedControl
            options={TREND_RANGES.map((value) => ({ value, label: t(RANGE_KEY[value]) }))}
            value={range}
            onChange={setRange}
            accessibilityLabel={t('progress:range.label')}
            className="w-[132px]"
          />
        }
      />

      <Card>
        <View className="gap-4">
          <View className="flex-row items-end justify-between gap-md">
            <View className="min-w-0 flex-1">
              <Text variant="overline">{t('activity:steps.todaySoFar')}</Text>
              <Text variant="display" numberOfLines={1}>
                {count(steps)}
              </Text>
              <Text variant="meta">
                {t('activity:steps.unit', {
                  distance: distance(day.data?.distanceM ?? null) ?? '—',
                })}
              </Text>
            </View>
            <View className="items-end">
              <Text variant="meta">{t('activity:steps.goalLine', { goal: count(goal) })}</Text>
              <Text variant="label" className={difference >= 0 ? 'text-pandan-ink' : 'text-muted'}>
                {difference >= 0
                  ? t('activity:steps.over', { value: count(difference) })
                  : t('activity:steps.under', { value: count(-difference) })}
              </Text>
            </View>
          </View>

          <ProgressBar
            value={goal > 0 ? steps / goal : 0}
            tone="water"
            height={14}
            accessibilityLabel={t('activity:steps.goalLine', { goal: count(goal) })}
          />

          {hours.isPending ? (
            <Skeleton className="h-[120px] w-full" />
          ) : hourly.length === 0 ? (
            <Text variant="meta">{t('activity:steps.noHours')}</Text>
          ) : (
            <>
              <HourBars
                hours={hourly}
                blocks={!detailed}
                blockLabels={[
                  t('activity:steps.morning'),
                  t('activity:steps.afternoon'),
                  t('activity:steps.evening'),
                ]}
                accessibilityLabel={hourlySummary(hourly)}
              />
              {/* No footnote when the chart falls back to three blocks. The
                  grouping is legible from the labels themselves, and a sentence
                  explaining the app's own data plumbing is not something the
                  reader asked for. */}
              {detailed && busiest != null ? (
                <Text variant="meta">
                  {t('activity:steps.busiest', { hour: hourLabel(busiest) })}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </Card>

      <Card title={range === '7d' ? t('activity:steps.weekTitle') : t(SPAN_KEY[range])}>
        {series.isPending || !series.data ? (
          <Skeleton className="h-[130px] w-full" />
        ) : (
          <View className="gap-4">
            {/* Columns of steps per bucket, drawn inline rather than through
                `HourBars`: that component's bar is "did this hour move at all",
                while this one is "did the bucket reach the goal", and the two
                colour rules have nothing in common but a rectangle. */}
            <View className="flex-row items-end gap-1.5" style={{ height: 130 }}>
              {series.data.map((bucket, index) => {
                const average = perDay(bucket)
                /**
                 * "Did this bucket average the goal", not "did any day in it".
                 *
                 * `stepGoalDays > 0` is the second reading, and over a seven-day
                 * block it means one good Saturday paints the whole week blue —
                 * four of five columns filled while the stat row beside them
                 * said "GOAL DAYS 8 of 30". Against the average the colour means
                 * the same thing at every range, and on 7d — where a bucket IS a
                 * day — it is exactly the old rule.
                 */
                const met = goal > 0 && average >= goal
                return (
                  <View key={bucket.start} className="h-full min-w-0 flex-1 items-center gap-1.5">
                    <View className="w-full flex-1 justify-end">
                      <View
                        className={
                          met ? 'w-full rounded-lg bg-water' : 'w-full rounded-lg bg-track'
                        }
                        style={{
                          height: `${Math.max(4, (average / stepsPeak) * 100)}%`,
                        }}
                      />
                    </View>
                    <Text numberOfLines={1} variant="micro" className="h-[14px]">
                      {range === '7d'
                        ? format(parseISO(bucket.end), 'EEEEE')
                        : range === '1y'
                          ? format(parseISO(bucket.start), 'LLLLL')
                          : t('progress:range.week', {
                              index: index + 1,
                            })}
                    </Text>
                  </View>
                )
              })}
            </View>

            <StatRow stats={stats} />

            <Text variant="meta">
              {t(
                PATTERN_KEY[
                  weekShape(
                    summary.data?.steps ?? null,
                    summary.data?.stepsBest ?? 0,
                    summary.data?.activeDays ?? 0,
                  )
                ],
              )}
            </Text>
          </View>
        )}
      </Card>
    </Screen>
  )
}

/**
 * Which sentence goes under the week.
 *
 * Three outcomes with a real threshold between them, rather than one hedged
 * line that is true of every week. It reads the summary rather than the buckets
 * because the comparison it makes — best against average — is a range figure,
 * and `activity_summary` already weighted the days.
 *
 * Returns the shape rather than the copy so the caller keeps the typed `t`; see
 * `SPAN_KEY` in `features/progress/axis.ts` for the same reasoning about
 * assembled keys.
 */
type WeekShape = 'short' | 'uneven' | 'steady'

function weekShape(average: number | null, best: number, activeDays: number): WeekShape {
  // Under four days of data there is no pattern, only a gap.
  if (activeDays < 4 || !average || average <= 0) return 'short'
  /**
   * A best day a third above the average means the week has a shape: a few days
   * carry it and the rest do not.
   *
   * The threshold was 1.8 first, which is far too high — a week of 9,600 / 6,900
   * with the weekend at half the weekdays came out as "even", directly under a
   * chart with two obviously short bars in it. 1.35 is roughly one short day in
   * seven, which is the point at which the suggestion is worth making.
   */
  return best / average > 1.35 ? 'uneven' : 'steady'
}

const PATTERN_KEY = {
  short: 'activity:steps.shortNote',
  uneven: 'activity:steps.weekendNote',
  steady: 'activity:steps.steadyNote',
} as const satisfies Record<WeekShape, string>

const RANGE_KEY = {
  '7d': 'progress:range.7d',
  '30d': 'progress:range.30d',
  '1y': 'progress:range.1y',
} as const satisfies Record<TrendRange, string>

const SPAN_KEY = {
  '7d': 'progress:range.span7d',
  '30d': 'progress:range.span30d',
  '1y': 'progress:range.span1y',
} as const satisfies Record<TrendRange, string>
