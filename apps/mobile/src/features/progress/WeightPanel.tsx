import { differenceInCalendarDays, format, isToday, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import {
  bodyFrom,
  type TrendBucket,
  type TrendRange,
  type TrendSummary,
  today,
  useProfile,
  useWeighIns,
} from '@/data'
import { datePattern } from '@/lib/dates'
import { goalDate } from '@/lib/nutrition'
import { showChange, showWeight, UNIT_KEY, type WeightUnit } from '@/lib/units'
import { radius } from '@/theme/tokens'
import { Badge, Button, Card, Divider, EmptyState, Icon, ListRow, Squish, Text } from '@/ui'
import { bucketLabels, chunk, SPAN_KEY } from './axis'
import { StatTrio } from './StatTrio'
import { TrendLine } from './TrendLine'

export type WeightPanelProps = {
  range: TrendRange
  buckets: readonly TrendBucket[]
  summary: TrendSummary | null
  unit: WeightUnit
  /** Opens the weigh-in sheet on a given day. The sheet itself is the screen's. */
  onEdit: (date: string) => void
}

/** Rows in the list card. Six covers six weeks of weekly weigh-ins. */
const HISTORY_ROWS = 6
/** Months to a quarter, for the year view's summary list. */
const QUARTER = 3

/**
 * T1 / T5 / T8 — the weight tab.
 *
 * The line, then the three figures, then the readings behind them. Only the last
 * card changes with the range, and it changes because the useful grain does: at
 * seven days the readings themselves are worth listing and each one is editable,
 * at thirty days they are too many and the weeks say it better, and over a year
 * only the quarters are legible at all.
 *
 * The chart is a line rather than bars — see `TrendLine` for why — and the card
 * under it is the one place on this screen that reads the profile, because "3.4
 * kg to your 65.0 kg goal" is the only sentence here about a target rather than
 * about what happened.
 */
export function WeightPanel({ range, buckets, summary, unit, onEdit }: WeightPanelProps) {
  const { t } = useTranslation(['progress', 'common'])
  const { data: profile } = useProfile()
  const { data: weighIns = [] } = useWeighIns()

  const labels = bucketLabels(buckets, range, (index) => t('progress:range.week', { index }))
  const unitLabel = t(UNIT_KEY[unit])

  if (!summary || summary.weighIns === 0) {
    return (
      <Card>
        <EmptyState
          title={t('progress:weight.emptyTitle')}
          description={t('progress:weight.emptyBody')}
          icon={{ set: 'body', name: 'weighing-scale' }}
          action={
            <Button onPress={() => onEdit(today())}>{t('progress:weight.sheetTitle')}</Button>
          }
        />
      </Card>
    )
  }

  const current = summary.weightLast
  /** Signed, oldest to newest. Null with a single reading — one point is not a trend. */
  const change =
    summary.weightFirst !== null && current !== null && summary.weighIns > 1
      ? current - summary.weightFirst
      : null

  const target = Number(profile?.target_weight_kg ?? 0)
  const body = bodyFrom(profile, current ?? undefined)
  const reachedOn = body && target > 0 ? goalDate(body, target, new Date()) : null
  const remaining = target > 0 && current !== null ? Math.abs(current - target) : null

  const stats =
    range === '1y'
      ? [
          {
            key: 'change',
            label: t('progress:weight.thisYear'),
            value: changeText(change, unit, unitLabel),
          },
          {
            key: 'low',
            label: t('progress:weight.lightest'),
            value: lightest(buckets, unit, unitLabel, t('progress:metric.none')),
          },
          {
            key: 'logged',
            label: t('progress:weight.monthsLogged'),
            value: t('progress:ofDays', {
              done: buckets.filter((bucket) => bucket.weighIns > 0).length,
              total: buckets.length,
            }),
          },
        ]
      : [
          {
            key: 'change',
            label: range === '7d' ? t('progress:weight.thisWeek') : t('progress:weight.thisMonth'),
            value: changeText(change, unit, unitLabel),
          },
          {
            key: 'avg',
            label: range === '7d' ? t('progress:weight.average7') : t('progress:weight.average30'),
            value:
              summary.weightAvg === null
                ? t('progress:metric.none')
                : `${showWeight(summary.weightAvg, unit)} ${unitLabel}`,
          },
          {
            key: 'count',
            label: t('progress:weight.weighIns'),
            value: t('progress:ofDays', { done: summary.weighIns, total: summary.days }),
          },
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
              {summary.weightPeak === null || summary.weightPeakOn === null
                ? t('progress:weight.emptyTitle')
                : range === '1y'
                  ? t('progress:weight.peakIn', {
                      value: showWeight(summary.weightPeak, unit),
                      unit: unitLabel,
                      month: format(parseISO(summary.weightPeakOn), 'LLLL'),
                    })
                  : t('progress:weight.peakOn', {
                      value: showWeight(summary.weightPeak, unit),
                      unit: unitLabel,
                      date: format(parseISO(summary.weightPeakOn), datePattern('dayMonthLong')),
                    })}
            </Text>
          </View>

          {change === null ? null : (
            <Badge tone={change <= 0 ? 'pandan' : 'kaya'} className="px-3 py-2">
              <Icon set="body" name={change <= 0 ? 'trend-down' : 'trend-up'} size={17} />
              <Text
                variant="caption"
                className={change <= 0 ? 'text-pandan-ink' : 'text-kaya-ink'}
                numberOfLines={1}
              >
                {t('progress:weight.change', {
                  value: showWeight(Math.abs(change), unit),
                  unit: unitLabel,
                })}
              </Text>
            </Badge>
          )}
        </View>

        <TrendLine
          points={buckets.map((bucket, index) => ({
            key: bucket.start,
            label: labels[index],
            value: bucket.weight,
          }))}
          // Where the line starts. Without it a range opening on an unweighed
          // day begins partway across the card.
          carryFrom={summary.weightBefore}
          accessibilityLabel={t('progress:weight.chart', { span: t(SPAN_KEY[range]) })}
        />
      </Card>

      <Card>
        <StatTrio stats={stats} />

        <Divider />

        <View className="flex-row items-center gap-2.5">
          <Icon set="body" name="target" size={26} />
          <Text variant="label" className="min-w-0 flex-1">
            {remaining === null
              ? t('progress:weight.noTarget')
              : remaining < 0.1
                ? t('progress:weight.atGoal')
                : t('progress:weight.toGoal', {
                    value: showWeight(remaining, unit),
                    target: showWeight(target, unit),
                    unit: unitLabel,
                  })}
          </Text>
          {reachedOn && remaining !== null && remaining >= 0.1 ? (
            <Text variant="caption">
              {t('progress:weight.weeksAway', {
                count: Math.max(1, Math.ceil(differenceInCalendarDays(reachedOn, new Date()) / 7)),
              })}
            </Text>
          ) : null}
        </View>
      </Card>

      {range === '7d' ? (
        <Card
          title={t('progress:weight.recentTitle')}
          contentClassName="gap-0"
          action={
            // A pill rather than a full-width button under the card. The list is
            // where somebody notices a reading is missing, so the way to add one
            // belongs at the top of it.
            <Squish
              depth={0}
              radius={radius.full}
              slabClassName="bg-transparent"
              className="min-h-sm flex-row items-center gap-1.5 bg-track px-3"
              onPress={() => onEdit(today())}
              accessibilityRole="button"
              accessibilityLabel={t('progress:weight.sheetTitle')}
            >
              <Icon set="body" name="weighing-scale" size={17} />
              {/* `label` rather than the display face at 15px. Baloo carries
                  ascender space this string does not use, so centring the two
                  boxes left the word sitting visibly below the icon beside it;
                  the body face is metrically what every other pill here uses. */}
              <Text variant="label" className="text-pandan-ink">
                {t('progress:weight.add')}
              </Text>
            </Squish>
          }
        >
          {history(weighIns).map((entry, index, all) => (
            <ListRow
              key={entry.date}
              leading={
                <View className="h-10 w-10 items-center justify-center rounded-sm bg-track">
                  <Icon set="body" name="weighing-scale" size={26} />
                </View>
              }
              title={t('progress:weight.reading', {
                value: showWeight(entry.kg, unit),
                unit: unitLabel,
              })}
              subtitle={
                isToday(parseISO(entry.date))
                  ? t('progress:weight.readingToday')
                  : format(parseISO(entry.date), datePattern('weekdayDayMonth'))
              }
              // Every row leads to the same sheet, on its own day — which is the
              // only way to correct a reading typed at the wrong scale.
              onPress={() => onEdit(entry.date)}
              divider={index < all.length - 1}
              trailing={
                <Text
                  variant="label"
                  className={
                    entry.change === undefined
                      ? 'text-faint'
                      : entry.change > 0
                        ? 'text-kaya-ink'
                        : 'text-pandan-ink'
                  }
                >
                  {entry.change === undefined
                    ? t('progress:weight.firstReading')
                    : showChange(entry.change, unit)}
                </Text>
              }
            />
          ))}
        </Card>
      ) : range === '30d' ? (
        <Card title={t('progress:weight.weekByWeek')} contentClassName="gap-0">
          {buckets.map((bucket, index) => (
            <ListRow
              key={bucket.start}
              title={t('progress:range.weekLong', { index: index + 1 })}
              divider={index < buckets.length - 1}
              trailing={
                <SpanValue
                  value={
                    bucket.weightAvg === null
                      ? t('progress:metric.none')
                      : `${showWeight(bucket.weightAvg, unit)} ${unitLabel}`
                  }
                  change={stepChange(buckets, index)}
                  unit={unit}
                  label={unitLabel}
                />
              }
            />
          ))}
        </Card>
      ) : (
        <Card title={t('progress:weight.byQuarter')} contentClassName="gap-0">
          {chunk(buckets, QUARTER).map((group, index, all) => (
            <ListRow
              key={group[0].start}
              title={t('progress:weight.quarter', {
                from: format(parseISO(group[0].start), 'LLL'),
                to: format(parseISO(group[group.length - 1].start), 'LLL'),
              })}
              divider={index < all.length - 1}
              trailing={<SpanValue change={groupChange(group)} unit={unit} label={unitLabel} />}
            />
          ))}
        </Card>
      )}
    </>
  )
}

/** A value and a signed change side by side, for the two summary lists. */
function SpanValue({
  value,
  change,
  unit,
  label,
}: {
  value?: string
  change: number | null
  unit: WeightUnit
  label: string
}) {
  return (
    <View className="flex-row items-baseline gap-2.5">
      {value ? (
        <Text variant="label" className="text-ink">
          {value}
        </Text>
      ) : null}
      <Text
        variant="label"
        className={
          change === null ? 'text-faint' : change > 0 ? 'text-kaya-ink' : 'text-pandan-ink'
        }
      >
        {change === null ? '—' : `${showChange(change, unit)} ${label}`}
      </Text>
    </View>
  )
}

/** "−0.5 kg", or a dash where a single reading makes the change undefined. */
function changeText(change: number | null, unit: WeightUnit, label: string) {
  return change === null ? '—' : `${showChange(change, unit)} ${label}`
}

/** The lightest reading in the range, from the buckets' own minima. */
function lightest(buckets: readonly TrendBucket[], unit: WeightUnit, label: string, none: string) {
  const values = buckets
    .map((bucket) => bucket.weightMin)
    .filter((value): value is number => value !== null)
  return values.length ? `${showWeight(Math.min(...values), unit)} ${label}` : none
}

/** One bucket against the one before it. Null where either has no reading. */
function stepChange(buckets: readonly TrendBucket[], index: number) {
  const here = buckets[index]?.weightAvg
  const before = buckets[index - 1]?.weightAvg
  return here != null && before != null ? here - before : null
}

/** A quarter's movement: where its last month ended against where its first did. */
function groupChange(group: readonly TrendBucket[]) {
  const values = group
    .map((bucket) => bucket.weight)
    .filter((value): value is number => value !== null)
  return values.length > 1 ? values[values.length - 1] - values[0] : null
}

/**
 * The readings as a list, newest first, each against the one before it.
 *
 * The chart shows the shape and the list shows the numbers — including the days
 * with no reading, by simply not being there, which a chart of evenly spaced
 * columns cannot say.
 */
function history(weighIns: readonly { date: string; kg: number }[]) {
  return weighIns
    .map((entry, index) => ({
      ...entry,
      change: index > 0 ? entry.kg - weighIns[index - 1].kg : undefined,
    }))
    .slice(-HISTORY_ROWS)
    .reverse()
}
