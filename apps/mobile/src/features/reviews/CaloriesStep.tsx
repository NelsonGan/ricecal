import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { ReviewBucket, ReviewKind, ReviewPeriod, ReviewSummary } from '@/data'
import { TrendLine } from '@/features/progress'
import { useThemeColors } from '@/theme/useTheme'
import { Badge, Card, Icon, ProgressBar, Text } from '@/ui'
import { underGoalShare } from './period'
import { Shareable } from './ShareableCards'

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
 * The calories, against the budget and against the periods either side.
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
  const colors = useThemeColors()

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
      <Shareable title={t('reviews:calories.average')}>
        <Card contentClassName="gap-2 p-card">
          {/* `mb-2` on top of the card's own gap, which is the sixteen points
              every heading in a story stands off its content by. */}
          <Text variant="overline" className="mb-2">
            {t('reviews:calories.average')}
          </Text>

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
                <Icon
                  set="ui"
                  name={delta >= 0 ? 'arrow-down' : 'arrow-up'}
                  size={14}
                  tintColor={delta >= 0 ? colors.pandanInk : colors.kayaInk}
                />
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
      </Shareable>

      <Shareable
        title={kind === 'week' ? t('reviews:calories.everyDay') : t('reviews:calories.everyWeek')}
      >
        <Card
          title={kind === 'week' ? t('reviews:calories.everyDay') : t('reviews:calories.everyWeek')}
          contentClassName="gap-3 p-card"
        >
          {/* `mt-1` on top of the card's own gap: sixteen points under a
              heading, the same standoff every card in a story gives its own. */}
          {/* A line with a dot a column and the budget as the dashed rule, the
              same chart as Trends, so the two read alike. A column nobody
              logged is skipped rather than drawn as a fast. */}
          <TrendLine
            className="mt-1"
            height={118}
            gaps="join"
            goal={goal}
            minPad={50}
            interactive={false}
            dotTone={(value) => (goal !== null && value > goal ? 'kaya' : 'pandan')}
            points={buckets.map((bucket, position) => ({
              key: bucket.start,
              label:
                kind === 'week'
                  ? format(parseISO(bucket.start), 'EEEEE')
                  : t('progress:range.week', { index: position + 1 }),
              value: bucket.kcal === null ? null : Math.round(bucket.kcal),
            }))}
            formatValue={(value) => Math.round(value).toLocaleString()}
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
      </Shareable>

      {compared.length > 1 ? (
        <Shareable
          title={
            kind === 'week' ? t('reviews:calories.pastWeeks') : t('reviews:calories.pastMonths')
          }
        >
          <Card
            title={
              kind === 'week' ? t('reviews:calories.pastWeeks') : t('reviews:calories.pastMonths')
            }
            contentClassName="gap-3 p-card"
          >
            {/* The same line as every other chart here: one dot a period,
                this one the solid dot at the end, the budget dashed. Fat bars
                from a floor read as amounts and made a 100 kcal difference
                look like half the week. */}
            <TrendLine
              className="mt-1"
              height={104}
              gaps="join"
              goal={goal}
              minPad={50}
              interactive={false}
              dotTone={(value) => (goal !== null && value > goal ? 'kaya' : 'pandan')}
              points={compared.map((period) => ({
                key: period.start,
                label: format(parseISO(period.start), kind === 'week' ? 'd MMM' : 'LLL'),
                value: period.kcal === null ? null : Math.round(period.kcal),
              }))}
              formatValue={(value) => Math.round(value).toLocaleString()}
              accessibilityLabel={
                kind === 'week' ? t('reviews:calories.pastWeeks') : t('reviews:calories.pastMonths')
              }
            />
          </Card>
        </Shareable>
      ) : null}
    </>
  )
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
