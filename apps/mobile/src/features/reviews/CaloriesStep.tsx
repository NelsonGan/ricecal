import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { ReviewBucket, ReviewKind, ReviewPeriod, ReviewSummary } from '@/data'
import { StackedBars } from '@/features/progress'
import { energyShare } from '@/lib/nutrition'
import { Badge, Card, Icon, ProgressBar, Text } from '@/ui'
import { PeriodBars } from './PeriodBars'
import { underGoalShare } from './period'

export type CaloriesStepProps = {
  kind: ReviewKind
  summary: ReviewSummary
  buckets: readonly ReviewBucket[]
  /** Every period in the window, newest first. The comparison chart's source. */
  periods: readonly ReviewPeriod[]
}

/** How many periods the comparison chart shows, this one included. */
const COMPARED = 5

/**
 * Step 3: the calories, against the budget and against the periods either side.
 *
 * Three cards asking three questions in the order somebody asks them: how much,
 * how it moved day by day, and whether that is more or less than usual.
 *
 * The comparison chart draws EVERY period in its window, including the ones too
 * thin to have a review of their own. That is the reason `review_periods`
 * returns `qualifies` as a column rather than filtering: a light week is still
 * a bar on this chart, and a chart with a hole in it and no explanation is
 * worse than one showing a short week honestly.
 */
export function CaloriesStep({ kind, summary, buckets, periods }: CaloriesStepProps) {
  const { t } = useTranslation(['reviews', 'progress'])

  const goal = summary.kcalGoal
  const average = summary.kcal
  const delta = goal !== null && average !== null ? Math.round(goal - average) : null

  /**
   * This period and the four before it, oldest first.
   *
   * Found by position in the list rather than by date arithmetic: the list is
   * already ordered newest first and already knows what the period before this
   * one was, which for a month is a question about calendars and not about
   * subtraction.
   */
  const index = periods.findIndex((period) => period.start === summary.start)
  const compared = index < 0 ? [] : periods.slice(index, index + COMPARED).reverse()

  return (
    <>
      <Card contentClassName="gap-2 p-card">
        <Text variant="overline">{t('reviews:calories.average')}</Text>

        <View className="flex-row items-end justify-between gap-md">
          <View className="flex-row items-baseline gap-2">
            <Text className="font-display text-[38px] leading-[46px] text-ink">
              {Math.round(average ?? 0).toLocaleString()}
            </Text>
            <Text variant="label" className="text-muted">
              {t('reviews:calories.kcal')}
            </Text>
          </View>

          {delta === null ? null : (
            <Badge tone={delta >= 0 ? 'pandan' : 'kaya'} className="px-3 py-1.5">
              <Icon set="body" name={delta >= 0 ? 'trend-down' : 'trend-up'} size={16} />
              <Text
                variant="caption"
                numberOfLines={1}
                className={delta >= 0 ? 'text-pandan-ink' : 'text-kaya-ink'}
              >
                {delta >= 0
                  ? t('reviews:calories.under', { value: delta.toLocaleString() })
                  : t('reviews:calories.over', { value: Math.abs(delta).toLocaleString() })}
              </Text>
            </Badge>
          )}
        </View>

        {goal === null ? (
          <Text variant="meta">{t('reviews:calories.noGoal')}</Text>
        ) : (
          <>
            {/* How much of the period landed under the line, not how close the
                average was to it. An average bar would be nearly full on a week
                that went over on three days out of five. */}
            <ProgressBar
              value={underGoalShare(summary)}
              tone="pandan"
              height={12}
              accessibilityLabel={t('reviews:calories.goalNote', {
                goal: goal.toLocaleString(),
                done: summary.daysUnderGoal,
                total: summary.daysLogged,
              })}
            />
            <Text variant="meta">
              {t('reviews:calories.goalNote', {
                goal: goal.toLocaleString(),
                done: summary.daysUnderGoal,
                total: summary.daysLogged,
              })}
            </Text>
          </>
        )}
      </Card>

      <Card
        title={kind === 'week' ? t('reviews:calories.everyDay') : t('reviews:calories.everyWeek')}
        contentClassName="gap-3 p-card"
      >
        <StackedBars
          height={118}
          bars={buckets.map((bucket, position) => ({
            key: bucket.start,
            label:
              kind === 'week'
                ? format(parseISO(bucket.start), 'EEEEE')
                : t('progress:range.week', { index: position + 1 }),
            value: bucket.kcal,
            share: energyShare({
              carbs: bucket.carbs ?? 0,
              protein: bucket.protein ?? 0,
              fat: bucket.fat ?? 0,
            }),
          }))}
          accessibilityLabel={t('reviews:calories.chart')}
        />

        {summary.lightestOn && summary.heaviestOn ? (
          <View className="flex-row gap-md">
            <Extreme
              value={summary.lightestKcal}
              label={t('reviews:calories.lightest', {
                day: dayName(kind, summary.lightestOn).toUpperCase(),
              })}
            />
            <View className="w-px bg-line" />
            <Extreme
              value={summary.heaviestKcal}
              label={t('reviews:calories.heaviest', {
                day: dayName(kind, summary.heaviestOn).toUpperCase(),
              })}
            />
          </View>
        ) : null}
      </Card>

      {compared.length > 1 ? (
        <Card
          title={
            kind === 'week' ? t('reviews:calories.pastWeeks') : t('reviews:calories.pastMonths')
          }
          contentClassName="gap-3 p-card"
        >
          <PeriodBars
            height={104}
            bars={compared.map((period) => ({
              key: period.start,
              label: format(parseISO(period.start), kind === 'week' ? 'd MMM' : 'LLL'),
              value: period.kcal === null ? t('reviews:calories.noData') : thousands(period.kcal),
              height: barHeight(period.kcal, compared),
              current: period.start === summary.start,
            }))}
            accessibilityLabel={
              kind === 'week' ? t('reviews:calories.pastWeeks') : t('reviews:calories.pastMonths')
            }
          />
        </Card>
      ) : null}
    </>
  )
}

/** "1.96k", which is what fits over a fifth of a card. */
function thousands(kcal: number): string {
  return `${(kcal / 1000).toFixed(2)}k`
}

/**
 * How tall one comparison bar is, measured against the SPREAD of the five
 * rather than from zero.
 *
 * Five weeks of one person's eating sit within a few hundred calories of each
 * other, so bars drawn from zero are five rectangles of the same height and the
 * chart says nothing the figures above it did not. The floor is a tenth of the
 * spread below the smallest, which keeps the lightest period a short bar rather
 * than no bar. A period with nothing logged has no height at all and draws as
 * the stub `PeriodBars` gives it.
 */
function barHeight(kcal: number | null, all: readonly ReviewPeriod[]): number {
  if (kcal === null) return 0

  const values = all.map((period) => period.kcal).filter((value): value is number => value !== null)
  const peak = Math.max(...values)
  const low = Math.min(...values)
  const floor = low - (peak - low) * 0.4
  const span = peak - floor || 1
  return (kcal - floor) / span
}

/**
 * What names the lightest or heaviest column: "THU" in a week, "13 JUL" in a
 * month.
 *
 * Abbreviated because the label it goes into shares a card with its twin, which
 * leaves it about half the width: "THURSDAY, LIGHTEST" truncated to
 * "THURSDAY, LIGHTE…" and dropped the word the row exists for.
 */
function dayName(kind: ReviewKind, date: string): string {
  return format(parseISO(date), kind === 'week' ? 'EEE' : 'd LLL')
}

function Extreme({ value, label }: { value: number | null; label: string }) {
  const { t } = useTranslation('reviews')

  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row items-baseline gap-1">
        <Text className="font-display text-[20px] text-ink" numberOfLines={1}>
          {(value ?? 0).toLocaleString()}
        </Text>
        <Text variant="micro">{t('calories.kcal')}</Text>
      </View>
      <Text variant="overlineSm" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}
