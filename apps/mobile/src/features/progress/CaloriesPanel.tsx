import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { TrendBucket, TrendRange, TrendSummary } from '@/data'
import { energyShare } from '@/lib/nutrition'
import { Badge, Card, cn, EmptyState, Icon, ListRow, Text } from '@/ui'
import { bucketLabels, SPAN_KEY } from './axis'
import { CountRow } from './CountRow'
import { StackedBars } from './StackedBars'

export type CaloriesPanelProps = {
  range: TrendRange
  buckets: readonly TrendBucket[]
  summary: TrendSummary | null
}

/** How many months the year view calls out by name. Three fit without scrolling. */
const NOTABLE = 3

/**
 * T2 / T6 / T9 — the calorie tab.
 *
 * Three cards, in the order the questions get asked: how much, made of what, and
 * against what. The first two are the same at every range and only the third
 * changes — a year has no useful "days under 2,100", because 300 of them are a
 * number nobody can picture, so it names the months that stood out instead.
 */
export function CaloriesPanel({ range, buckets, summary }: CaloriesPanelProps) {
  const { t } = useTranslation(['progress', 'common'])

  const labels = bucketLabels(buckets, range, (index) => t('progress:range.week', { index }))
  const goal = summary?.kcalGoal ?? null
  const average = summary?.kcal ?? null
  /** Positive is under budget, which is the direction the pill's arrow points. */
  const delta = goal !== null && average !== null ? Math.round(goal - average) : null

  if (!summary || summary.daysLogged === 0) {
    return (
      <Card>
        <EmptyState
          title={t('progress:calories.emptyTitle')}
          description={t('progress:calories.emptyBody')}
          icon={{ set: 'body', name: 'flame-burn' }}
        />
      </Card>
    )
  }

  const split = energyShare({
    carbs: summary.carbs ?? 0,
    protein: summary.protein ?? 0,
    fat: summary.fat ?? 0,
  })

  const macros = [
    {
      key: 'carbs',
      label: t('common:macro.carbs'),
      swatch: 'bg-kaya',
      grams: summary.carbs,
      share: split.carbs,
    },
    {
      key: 'protein',
      label: t('common:macro.protein'),
      swatch: 'bg-hibiscus',
      grams: summary.protein,
      share: split.protein,
    },
    {
      key: 'fat',
      label: t('common:macro.fat'),
      swatch: 'bg-teh',
      grams: summary.fat,
      share: split.fat,
    },
  ]

  // Highest average first. Only buckets with something in them: a month nobody
  // logged is not a notable month.
  const notable = [...buckets]
    .filter((bucket) => bucket.kcal !== null)
    .sort((a, b) => (b.kcal ?? 0) - (a.kcal ?? 0))
    .slice(0, NOTABLE)

  return (
    <>
      <Card>
        <View className="flex-row items-end justify-between gap-md">
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="label" className="text-heading">
              {t(SPAN_KEY[range])}
            </Text>
            <Text variant="meta" numberOfLines={2}>
              {goal === null
                ? t('progress:calories.noGoal')
                : range === '7d'
                  ? t('progress:calories.goalNote', { goal: goal.toLocaleString() })
                  : range === '30d'
                    ? t('progress:calories.goalNoteWeekly', { goal: goal.toLocaleString() })
                    : t('progress:calories.goalNoteMonthly', { goal: goal.toLocaleString() })}
            </Text>
          </View>

          {delta === null ? null : (
            <Badge tone={delta >= 0 ? 'pandan' : 'kaya'} className="px-3 py-2">
              <Icon set="body" name={delta >= 0 ? 'trend-down' : 'trend-up'} size={17} />
              <Text
                variant="caption"
                className={delta >= 0 ? 'text-pandan-ink' : 'text-kaya-ink'}
                numberOfLines={1}
              >
                {delta >= 0
                  ? t('progress:calories.under', { value: delta.toLocaleString() })
                  : t('progress:calories.over', { value: Math.abs(delta).toLocaleString() })}
              </Text>
            </Badge>
          )}
        </View>

        <StackedBars
          bars={buckets.map((bucket, index) => ({
            key: bucket.start,
            label: labels[index],
            value: bucket.kcal,
            share: energyShare({
              carbs: bucket.carbs ?? 0,
              protein: bucket.protein ?? 0,
              fat: bucket.fat ?? 0,
            }),
          }))}
          accessibilityLabel={t('progress:calories.chart')}
        />

        <View className="flex-row flex-wrap gap-md">
          {macros.map((macro) => (
            <View key={macro.key} className="flex-row items-center gap-1.5">
              <View className={cn('h-2.5 w-2.5 rounded-[3px]', macro.swatch)} />
              <Text variant="caption">{macro.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        {/* The same three colours as the bars above, in one bar the width of the
            card — which is the only place the split is readable as a ratio
            rather than inferred from seven stacked columns. */}
        <View className="h-5 flex-row overflow-hidden rounded-full">
          {macros.map((macro) =>
            macro.share <= 0 ? null : (
              <View
                key={macro.key}
                className={macro.swatch}
                style={{ flexGrow: macro.share, flexBasis: 0 }}
              />
            ),
          )}
        </View>

        <View className="flex-row gap-2.5">
          {macros.map((macro) => (
            <View key={macro.key} className="min-w-0 flex-1 gap-1">
              <View className="flex-row items-center gap-1.5">
                <View className={cn('h-2.5 w-2.5 rounded-[3px]', macro.swatch)} />
                <Text variant="overlineSm" numberOfLines={1}>
                  {macro.label}
                </Text>
              </View>
              <Text className="font-display text-[17px] text-ink" numberOfLines={1}>
                {t('progress:calories.grams', { value: Math.round(macro.grams ?? 0) })}
              </Text>
              <Text variant="micro" numberOfLines={1}>
                {t('progress:calories.shareOfIntake', { value: Math.round(macro.share * 100) })}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {range === '1y' ? (
        <Card title={t('progress:calories.notableTitle')} contentClassName="gap-0">
          {notable.map((bucket, index) => (
            <ListRow
              key={bucket.start}
              title={format(parseISO(bucket.start), 'LLLL')}
              divider={index < notable.length - 1}
              trailing={
                <Text variant="label" className="text-muted">
                  {t('progress:calories.monthAverage', {
                    value: Math.round(bucket.kcal ?? 0).toLocaleString(),
                  })}
                </Text>
              }
            />
          ))}
        </Card>
      ) : (
        <Card title={t('progress:calories.goalTitle')}>
          {goal === null ? null : (
            <CountRow
              label={t('progress:calories.daysUnder', { goal: goal.toLocaleString() })}
              done={summary.daysUnderGoal}
              total={summary.days}
              caption={t('progress:ofDays', {
                done: summary.daysUnderGoal,
                total: summary.days,
              })}
            />
          )}
          <CountRow
            label={t('progress:calories.daysLogged')}
            done={summary.daysLogged}
            total={summary.days}
            caption={t('progress:ofDays', { done: summary.daysLogged, total: summary.days })}
          />
        </Card>
      )}
    </>
  )
}
