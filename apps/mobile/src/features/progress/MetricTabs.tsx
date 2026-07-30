import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { TrendSummary } from '@/data'
import { radius, slab } from '@/theme/tokens'
import { cn, Icon, type IconProps, Squish, Text } from '@/ui'
import { showWeight, UNIT_KEY, type WeightUnit } from './units'

export type TrendMetric = 'calories' | 'water' | 'weight'

export const TREND_METRICS = [
  'calories',
  'water',
  'weight',
] as const satisfies readonly TrendMetric[]

const ICONS: Record<TrendMetric, IconProps> = {
  calories: { set: 'body', name: 'flame-burn' },
  water: { set: 'body', name: 'water-drop' },
  weight: { set: 'body', name: 'weighing-scale' },
}

/**
 * Copy keys as maps rather than as templates, for the reason `SPAN_KEY` gives:
 * an assembled key type-checks and then renames silently.
 */
const LABEL_KEY = {
  calories: 'progress:metric.calories',
  water: 'progress:metric.water',
  weight: 'progress:metric.weight',
} as const satisfies Record<TrendMetric, string>

export type MetricTabsProps = {
  value: TrendMetric
  onChange: (value: TrendMetric) => void
  /** Null until the range's first answer arrives, and after it for an empty one. */
  summary: TrendSummary | null | undefined
  unit: WeightUnit
  className?: string
}

/**
 * The three tiles under the title, which are the tabs.
 *
 * A tile is a summary and a control in the same object: it says what the range
 * averaged, and tapping it swaps the panel below. That is why these are not
 * `Tabs` or a `SegmentedControl` — both of those are labels, and the number is
 * half the point. It is also why the row sits above the panel rather than in it:
 * the three figures are true whichever one is selected, so they must not move or
 * change when the selection does.
 *
 * The selected tile fills pandan whichever metric it is. Tinting each tab its
 * own colour was the first attempt and it made the row read as three states of
 * one thing rather than as a choice between three.
 */
export function MetricTabs({ value, onChange, summary, unit, className }: MetricTabsProps) {
  const { t } = useTranslation(['progress', 'common'])

  const figures: Record<TrendMetric, { value: string; unit: string }> = {
    calories: {
      value:
        summary?.kcal != null
          ? Math.round(summary.kcal).toLocaleString()
          : t('progress:metric.none'),
      unit: t('progress:metric.caloriesUnit'),
    },
    water: {
      value: summary ? summary.water.toFixed(1) : t('progress:metric.none'),
      unit: t('progress:metric.waterUnit'),
    },
    weight: {
      value:
        summary?.weightLast != null
          ? showWeight(summary.weightLast, unit)
          : t('progress:metric.none'),
      unit: t(UNIT_KEY[unit]),
    },
  }

  return (
    <View className={cn('flex-row gap-2', className)} accessibilityRole="tablist">
      {TREND_METRICS.map((metric) => {
        const selected = metric === value
        const figure = figures[metric]
        const label = t(LABEL_KEY[metric])

        return (
          <Squish
            key={metric}
            depth={slab.md}
            radius={radius.md}
            containerClassName="flex-1"
            slabClassName={selected ? 'bg-pandan-slab' : 'bg-line'}
            // `grow` so the surface stretches to the tallest of the three and no
            // tile shows a bare strip of its own slab. Same reason `StatTile`
            // carries it.
            className={cn('grow gap-1.5 px-3 py-3', selected ? 'bg-pandan' : 'bg-surface')}
            onPress={() => onChange(metric)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={t('progress:metric.a11y', {
              metric: label,
              value: `${figure.value} ${figure.unit}`,
            })}
          >
            <View className="flex-row items-center gap-1.5">
              {/* Untinted on both states. These are flat colour illustrations
                  rather than glyphs, and a white silhouette of a scale is not
                  the same drawing. */}
              <Icon {...ICONS[metric]} size={16} />
              <Text
                numberOfLines={1}
                variant="overlineSm"
                className={cn('shrink', selected ? 'text-on-pandan' : 'text-muted')}
              >
                {label}
              </Text>
            </View>

            <View className="flex-row items-baseline gap-1">
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                // No `leading-` — `adjustsFontSizeToFit` beside an explicit line
                // height shrinks text that has room. The note on `StatTile` has
                // the long version.
                className={cn(
                  'shrink font-display text-[20px]',
                  selected ? 'text-on-pandan' : 'text-ink',
                )}
              >
                {figure.value}
              </Text>
              <Text variant="micro" className={selected ? 'text-on-pandan' : 'text-faint'}>
                {figure.unit}
              </Text>
            </View>
          </Squish>
        )
      })}
    </View>
  )
}
