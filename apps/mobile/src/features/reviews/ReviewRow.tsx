import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { ReviewPeriod } from '@/data'
import { showChange, type WeightUnit } from '@/lib/units'
import { useThemeColors } from '@/theme/useTheme'
import { cn, Divider, Icon, Tappable, Text } from '@/ui'
import { periodTitle, weekOfYear } from './period'

export type ReviewRowProps = {
  period: ReviewPeriod
  /** For the change on a monthly row. The list reads the preference once. */
  unit: WeightUnit
  /** The newest one, whose sparkline is drawn in the accent rather than grey. */
  latest?: boolean
  /**
   * Behind the paywall for this account.
   *
   * The row is drawn IN FULL and stays pressable — the sparkline, the average,
   * the days logged, all of it. Only the chevron changes, to a padlock. A
   * locked row that hid its own figures would be a row with nothing to want,
   * and the point of showing a free account its older weeks is that it can see
   * they are there. Pressing one opens the paywall, which is what a lock is
   * for: it says the door is shut and where the key is sold.
   */
  locked?: boolean
  divider?: boolean
  onPress: () => void
}

/**
 * One row of the reviews list: what the period was called, what it came to, and
 * a sparkline of the days inside it.
 *
 * The sparkline is the row's whole reason for being taller than a list item.
 * The sentence beside it is an average and a count, and neither can show that
 * the week was four heavy days and three missing ones — the bars can, in the
 * width of a thumbnail, and they are what makes two rows with the same average
 * look different from each other.
 *
 * Only the newest row draws them in colour. A list where every row is green is
 * a list with no emphasis in it, and the newest review is the one somebody came
 * here to open.
 */
export function ReviewRow({
  period,
  unit,
  latest = false,
  locked = false,
  divider = true,
  onPress,
}: ReviewRowProps) {
  const { t } = useTranslation(['reviews', 'common'])
  const colors = useThemeColors()

  const title = periodTitle(period.kind, period.start, period.end)

  /**
   * Two lines under the name, and they divide the same facts differently by
   * kind.
   *
   * A week is named by its number, which leaves the count of logged days to sit
   * beside the average. A month has no number anybody thinks in, so how much of
   * it was logged goes on the line where the week's number was, and the average
   * stands alone. Neither shape repeats a figure the other line already gave.
   */
  const meta =
    period.kind === 'week'
      ? t('reviews:list.weekMeta', { index: weekOfYear(period.start) })
      : t('reviews:list.monthMeta', {
          weeks: period.marks.length,
          done: period.daysLogged,
          total: period.days,
        })

  const kcal = period.kcal === null ? null : Math.round(period.kcal).toLocaleString()
  const weight =
    period.weightChange === null
      ? null
      : `${showChange(period.weightChange, unit)} ${t(`common:unit.${unit}`)}`

  const summary =
    kcal === null
      ? t('reviews:list.summaryEmpty')
      : period.kind === 'week'
        ? t('reviews:list.weekSummary', {
            kcal,
            done: period.daysLogged,
            total: period.days,
          })
        : // The scale, on the row where there is space for it. A month's own
          // line has already said how much of it was logged, and what a month
          // is actually asked about is which way the weight went.
          weight === null
          ? t('reviews:list.monthSummary', { kcal })
          : t('reviews:list.monthSummaryWeight', { kcal, weight })

  return (
    <>
      <Tappable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          locked
            ? t('reviews:list.a11yLocked', { title, meta, summary })
            : t('reviews:list.a11y', { title, meta, summary })
        }
        className="flex-row items-center gap-md py-3"
      >
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="label" className="text-ink" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="meta" numberOfLines={1}>
            {meta}
          </Text>
          <Text variant="caption" numberOfLines={1} className="text-ink">
            {summary}
          </Text>
        </View>

        <Sparkline marks={period.marks} latest={latest} />

        {/* Tinted, as `ListRow` does it: the chevron is chrome, and the
            illustration's own blue is the one colour on the row that means
            nothing. A locked row swaps it for a padlock in the same place and
            at the same weight — the row is not decorated differently, it just
            says what is behind it. */}
        {locked ? (
          <Icon set="system" name="lock" size={20} tintColor={colors.faint} />
        ) : (
          <Icon set="ui" name="chevron-right" size={20} tintColor={colors.faint} />
        )}
      </Tappable>
      {divider ? <Divider /> : null}
    </>
  )
}

/** Height of the tallest bar. Small enough that the row stays a list row. */
const SPARK_HEIGHT = 34

function Sparkline({ marks, latest }: { marks: readonly (number | null)[]; latest: boolean }) {
  const peak = Math.max(...marks.map((mark) => mark ?? 0), 1)

  // Materialised with an id rather than keyed on the index, the way
  // `StepProgress` does it: a tick is nothing but its position in the period,
  // so the position IS the identity, and saying so beats a lint suppression.
  const ticks = marks.map((mark, index) => ({ id: `tick-${index}`, value: mark }))

  return (
    <View
      className="flex-row items-end gap-[3px]"
      style={{ height: SPARK_HEIGHT }}
      // Decorative: the row's own label already says the average and the count,
      // which is everything these bars encode and more.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {ticks.map((tick) => (
        <View
          key={tick.id}
          className={cn(
            'w-[5px] rounded-full',
            tick.value === null ? 'bg-line' : latest ? 'bg-pandan' : 'bg-line-strong',
          )}
          // A day with nothing logged draws as a stub rather than as nothing,
          // so the gaps in a patchy week are visible as gaps.
          style={{
            height: tick.value === null ? 6 : Math.max(8, (tick.value / peak) * SPARK_HEIGHT),
          }}
        />
      ))}
    </View>
  )
}
