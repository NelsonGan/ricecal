import { format, parseISO } from 'date-fns'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  focusOf,
  type TrackFocus,
  type TrendBucket,
  type TrendRange,
  type TrendSummary,
  useSettings,
  useTargets,
  useUpdateSettings,
} from '@/data'
import { energyShare } from '@/lib/nutrition'
import { cn, SegmentedControl, Text } from '@/ui'
import { bucketLabels, SPAN_KEY } from './axis'
import { TrendCard, TrendChip } from './TrendCard'
import { TrendLine } from './TrendLine'

export type IntakeCardProps = {
  range: TrendRange
  buckets: readonly TrendBucket[] | undefined
  summary: TrendSummary | null | undefined
  loading: boolean
  problem?: 'offline' | 'unreachable' | null
  onRetry?: () => void
}

/**
 * What was eaten: calories against the budget, or protein against its target,
 * whichever the account follows (`track_focus`, which the ring on Today
 * reads too). The switch is the card's heading, so somebody counting protein
 * finds it where the calories were rather than in Settings.
 *
 * A calorie dot over the budget is kaya and one under is pandan, the colours a
 * gain and a loss are everywhere else. For protein the judgement flips: under
 * the target is the kaya one. A column nobody logged is left out of the line
 * rather than drawn at zero, since a day of no entries is not a day of no food.
 */
export function IntakeCard({
  range,
  buckets,
  summary,
  loading,
  problem,
  onRetry,
}: IntakeCardProps) {
  const { t } = useTranslation(['progress', 'common'])
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const { data: targets } = useTargets()
  const focus = focusOf(settings)
  const protein = focus === 'protein'

  // Calories are judged per day against the budget in force that day, which
  // the server returns. Protein has no history of targets in these rows, so it
  // is read against today's.
  const goal = protein ? targets?.protein || null : (summary?.kcalGoal ?? null)
  const average = protein ? (summary?.protein ?? null) : (summary?.kcal ?? null)
  /** Signed, average less goal. */
  const delta = goal !== null && average !== null ? Math.round(average - goal) : null
  const empty = !summary || summary.daysLogged === 0
  /**
   * Whether a value met its goal. A calorie column is judged against the
   * budget in force in that column (`kcalGoal` per bucket), so a budget
   * tightened last week does not recolour the weeks before it; protein has one
   * target to judge by.
   */
  const goalOn = new Map(buckets?.map((bucket) => [bucket.start, bucket.kcalGoal]) ?? [])
  const good = (value: number, key?: string) => {
    const against = !protein && key ? (goalOn.get(key) ?? goal) : goal
    return against === null ? true : protein ? value >= against : value <= against
  }

  const labels = buckets
    ? bucketLabels(buckets, range, (index) => t('progress:range.week', { index }))
    : []
  const split = energyShare({
    carbs: summary?.carbs ?? 0,
    protein: summary?.protein ?? 0,
    fat: summary?.fat ?? 0,
  })
  const macros = [
    { key: 'carbs', label: t('common:macro.carbs'), swatch: 'bg-kaya', share: split.carbs },
    {
      key: 'protein',
      label: t('common:macro.protein'),
      swatch: 'bg-hibiscus',
      share: split.protein,
    },
    { key: 'fat', label: t('common:macro.fat'), swatch: 'bg-teh', share: split.fat },
  ]
  const grams = (value: number) => t('progress:calories.grams', { value: Math.round(value) })

  return (
    <TrendCard
      icon={{ set: 'body', name: 'flame-burn' }}
      title={t(protein ? 'progress:metric.protein' : 'progress:metric.calories')}
      heading={
        <SegmentedControl
          size="sm"
          options={[
            { value: 'calories', label: t('progress:metric.calories') },
            { value: 'protein', label: t('progress:metric.protein') },
          ]}
          value={focus}
          onChange={(next: TrackFocus) => updateSettings.mutate({ track_focus: next })}
          accessibilityLabel={t('progress:focus')}
          className="w-[210px]"
        />
      }
      onOpen={() => router.push({ pathname: '/history', params: { metric: 'calories' } })}
      loading={loading || !buckets}
      problem={problem}
      onRetry={onRetry}
      figure={
        empty || average === null
          ? undefined
          : {
              value: Math.round(average).toLocaleString(),
              unit: t(protein ? 'progress:protein.unit' : 'progress:calories.unit'),
            }
      }
      chip={
        delta === null || empty ? null : (
          <TrendChip
            tone={good(average ?? 0) ? 'pandan' : 'kaya'}
            direction={delta >= 0 ? 'up' : 'down'}
            label={
              protein
                ? delta >= 0
                  ? t('progress:protein.above', { value: delta.toLocaleString() })
                  : t('progress:protein.short', { value: Math.abs(delta).toLocaleString() })
                : delta <= 0
                  ? t('progress:calories.under', { value: Math.abs(delta).toLocaleString() })
                  : t('progress:calories.over', { value: delta.toLocaleString() })
            }
          />
        )
      }
    >
      {empty || !buckets || !summary ? (
        <Text variant="meta">{t('progress:calories.empty')}</Text>
      ) : (
        <>
          <TrendLine
            // Remounted on a switch, so a readout left open on a calorie
            // point does not sit over the protein line.
            key={focus}
            gaps="join"
            goal={goal}
            minPad={protein ? 5 : 50}
            dotTone={(value, point) => (good(value, point.key) ? 'pandan' : 'kaya')}
            points={buckets.map((bucket, index) => {
              const value = protein ? bucket.protein : bucket.kcal
              return {
                key: bucket.start,
                label: labels[index],
                title: range === '1y' ? format(parseISO(bucket.start), 'LLLL') : undefined,
                value: value === null ? null : Math.round(value),
              }
            })}
            formatValue={(value) =>
              protein
                ? grams(value)
                : t('progress:calories.value', { value: Math.round(value).toLocaleString() })
            }
            formatTick={protein ? undefined : (value) => Math.round(value).toLocaleString()}
            accessibilityLabel={t(protein ? 'progress:protein.chart' : 'progress:calories.chart', {
              span: t(SPAN_KEY[range]),
            })}
          />

          {/* The split as one bar the width of the card: a ratio is read
              across, not inferred from a column of stacks. */}
          <View className="gap-2">
            <View className="h-2.5 flex-row overflow-hidden rounded-full bg-track">
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
            <View className="flex-row flex-wrap gap-x-4 gap-y-1">
              {macros.map((macro) => (
                <View key={macro.key} className="flex-row items-center gap-1.5">
                  <View className={cn('h-2.5 w-2.5 rounded-[3px]', macro.swatch)} />
                  <Text variant="caption">
                    {t('progress:calories.share', {
                      macro: macro.label,
                      value: Math.round(macro.share * 100),
                    })}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}
    </TrendCard>
  )
}
