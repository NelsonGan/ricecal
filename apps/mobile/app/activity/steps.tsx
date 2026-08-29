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
  useSettings,
} from '@/data'
import { count, distance, HourBars, hasHourlyShape, hourlySummary } from '@/features/activity'
import { type Stat, StatRow } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { AppBar, Card, ProgressBar, Screen, SegmentedControl, Skeleton, Text } from '@/ui'

/**
 * Steps: today at the top with its hourly shape, the range under it as a strip of
 * days. The range switch governs the lower half only, since today is today
 * whichever window is selected.
 *
 * The hourly chart degrades on purpose. Samsung Health writes steps in coarse
 * blocks rather than by the hour, and twenty-four columns of which three are
 * skyscrapers reads as "you sat still all morning", which is a claim about the
 * user rather than the recording. Without enough shape it draws three blocks.
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
  const { data: settings, isPending: settingsPending } = useSettings()

  /**
   * The goal is the user's, not the range's.
   *
   * It used to be read off `activity_summary`, which carries the step goal of
   * the newest day in the window — the same number at every range, but behind a
   * query keyed by one. So switching the control in the app bar took the figure
   * back to "no data", the `?? 8000` default filled in for it, and the top card
   * — the half of the screen this control is documented NOT to govern —
   * flickered its target, its over/under line and its progress bar on the way
   * past. `user_settings` is where the number actually lives and it is not
   * keyed by anything the user can change from here.
   */
  const goal = settings?.step_goal ?? 8000
  const steps = day.data?.steps ?? 0
  const difference = steps - goal
  const todayLoading = day.isPending || settingsPending

  const hourly = hours.data ?? []
  const detailed = hasHourlyShape(hourly)
  const patternKey =
    PATTERN_KEY[
      weekShape(
        summary.data?.steps ?? null,
        summary.data?.stepsBest ?? 0,
        summary.data?.activeDays ?? 0,
      )
    ]

  /**
   * The chart is drawn in steps per day rather than per bucket. On 7d the two are
   * the same number; everywhere else the totals were wrong in a way that looked
   * like data. On 30d the oldest column is the leftover after the seven-day
   * blocks, so two days at 10,940 steps rendered as a 20% stub beside blocks of
   * 48,000, and on 1y the newest column is the current month, which on the 3rd
   * reads as "you have stopped walking".
   *
   * Averages are also what the stat row under the chart reports and what
   * `BalanceBars` draws. This was the one chart comparing sums of unequal things.
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
      /**
       * Out of the days that were measured rather than the days in the range.
       * `days` is every date in the window and `active_days` is the ones carrying
       * a reading, which every other figure on this card already uses.
       *
       * A first connection gets a week-deep backfill, so a fresh account opening
       * the year view was told it hit its step goal on "1 of 351 days" while the
       * average beside it was computed over nine. A day nobody counted is not a
       * day the user failed.
       *
       * Water and calories keep `days`, because those are the user's own entries
       * and a day with nothing on it really is a day the goal was missed.
       */
      value: t('progress:ofDays', {
        done: summary.data?.stepGoalDays ?? 0,
        total: summary.data?.activeDays ?? 0,
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
          {/* The count, the target and the bar are one statement — "8,260 of
              8,000, 260 over" — so they arrive together or not at all. Split,
              the card read "0 steps, 8,000 under" for as long as the day was
              out, which is a worse answer than none. */}
          {todayLoading ? (
            <Skeleton className="h-[96px] w-full" />
          ) : (
            <>
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
                  <Text
                    variant="label"
                    className={difference >= 0 ? 'text-pandan-ink' : 'text-muted'}
                  >
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
            </>
          )}

          {hours.isPending ? (
            <Skeleton className="h-[120px] w-full" />
          ) : hourly.length === 0 ? (
            <Text variant="meta">{t('activity:steps.noHours')}</Text>
          ) : (
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
          )}
        </View>
      </Card>

      <Card title={range === '7d' ? t('activity:steps.weekTitle') : t(SPAN_KEY[range])}>
        {/* The summary as well as the series: the stat row and the sentence
            under the chart are read off it, and waiting on the series alone let
            them render as "—", "0 of 0" and the no-pattern-here note beside a
            chart that had already drawn the week. Same failure, and same fix, as
            the Trends panels. */}
        {series.isPending || summary.isPending || !series.data ? (
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

            {patternKey ? <Text variant="meta">{t(patternKey)}</Text> : null}
          </View>
        )}
      </Card>
    </Screen>
  )
}

/**
 * Which sentence goes under the week. Short and steady ranges get a status line;
 * uneven ranges get none, now that their advisory copy has gone. The classifier
 * still matters there, because calling visibly uneven bars "even" would be worse
 * than leaving the chart alone.
 *
 * It reads the summary rather than the buckets, because best against average is a
 * range figure and `activity_summary` already weighted the days.
 *
 * Returns the shape rather than the copy so the caller keeps the typed `t`.
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
   * seven, which is the point at which calling the range steady becomes false.
   */
  return best / average > 1.35 ? 'uneven' : 'steady'
}

const PATTERN_KEY = {
  short: 'activity:steps.shortNote',
  uneven: null,
  steady: 'activity:steps.steadyNote',
} as const satisfies Record<WeekShape, string | null>

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
