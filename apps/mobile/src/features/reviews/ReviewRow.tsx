import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { ReviewPeriod } from '@/data'
import { showChange, type WeightUnit } from '@/lib/units'
import { useThemeColors } from '@/theme/useTheme'
import { Card, cn, Divider, Icon, Tappable, Text } from '@/ui'
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
  /**
   * Workouts in the period, or null where the account has never trained in
   * the list's window, so a food-only account is not shown a column of
   * noughts.
   */
  workouts?: number | null
  /**
   * The newest period, drawn as its own card with the figures large: it is
   * the one somebody came here to open.
   */
  featured?: boolean
  divider?: boolean
  onPress: () => void
}

/**
 * One row of the reviews list: what the period was called, what it came to, and a
 * sparkline of the days inside it.
 *
 * The sparkline is why the row is taller than a list item. The sentence beside it
 * is an average and a count, neither of which can show that the week was four
 * heavy days and three missing ones; the bars can, in the width of a thumbnail.
 *
 * Only the newest row draws them in colour. A list where every row is green has
 * no emphasis in it, and the newest review is the one somebody came here to open.
 */
export function ReviewRow({
  period,
  unit,
  latest = false,
  locked = false,
  workouts = null,
  featured = false,
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

  const spoken =
    workouts === null
      ? summary
      : `${summary}, ${t('reviews:list.workoutCount', { count: workouts })}`
  const label = locked
    ? t('reviews:list.a11yLocked', { title, meta, summary: spoken })
    : t('reviews:list.a11y', { title, meta, summary: spoken })

  /**
   * The period as figures rather than a sentence: what was eaten, how much
   * training, which way the weight went, each behind the icon its Trends card
   * wears. A sentence had to be read; three figures in fixed places can be
   * run down the list.
   */
  const figures: { key: string; icon: FigureIcon; value: string; unit: string }[] = [
    { key: 'kcal', icon: 'flame-burn' as const, value: kcal ?? '—', unit: t('reviews:list.kcal') },
    ...(workouts === null
      ? []
      : [
          {
            key: 'workouts',
            icon: 'dumbbell' as const,
            value: workouts.toLocaleString(),
            unit: t('reviews:list.workouts', { count: workouts }),
          },
        ]),
    ...(weight === null
      ? []
      : [{ key: 'weight', icon: 'weighing-scale' as const, value: weight, unit: '' }]),
  ]

  const chevron = locked ? (
    <Icon set="system" name="lock" size={20} tintColor={colors.faint} />
  ) : (
    <Icon set="ui" name="chevron-right" size={20} tintColor={colors.faint} />
  )

  if (featured) {
    return (
      <Card contentClassName="gap-4 p-card">
        <Tappable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          className="gap-4"
        >
          {/* The title gets the whole width: "28 September to 4 October"
              beside a sparkline was an ellipsis. The sparkline sits with the
              week's number instead, which is the line with room. */}
          <View className="gap-1">
            <View className="flex-row items-center justify-between gap-md">
              <Text variant="overlineSm" numberOfLines={1} className="shrink">
                {period.kind === 'week'
                  ? t('reviews:list.latestWeek')
                  : t('reviews:list.latestMonth')}
              </Text>
              {chevron}
            </View>
            <Text variant="subtitle" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {title}
            </Text>
            <View className="flex-row items-end justify-between gap-md">
              <Text variant="meta" numberOfLines={1} className="shrink">
                {meta}
              </Text>
              <Sparkline marks={period.marks} latest={latest} />
            </View>
          </View>

          <View className="flex-row border-track border-t-2 pt-4">
            {figures.map((figure, index) => (
              <View
                key={figure.key}
                className={cn(
                  'min-w-0 flex-1 items-center gap-1',
                  index > 0 && 'border-track border-l-2',
                )}
              >
                <Icon set="body" name={figure.icon} size={22} />
                <Text
                  className="font-display text-[24px] text-ink"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {figure.value}
                </Text>
                {figure.unit ? (
                  <Text variant="micro" numberOfLines={1}>
                    {figure.unit}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </Tappable>
      </Card>
    )
  }

  return (
    <>
      <Tappable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="flex-row items-center gap-md py-3"
      >
        <View className="min-w-0 flex-1 gap-1">
          <View className="gap-0">
            <Text variant="label" className="text-ink" numberOfLines={1}>
              {title}
            </Text>
            <Text variant="meta" numberOfLines={1}>
              {meta}
            </Text>
          </View>
          {/* One line: the icons name the figures, so only calories keeps a
              unit word. With "workouts" spelled out the weight wrapped onto a
              line of its own beside the sparkline. */}
          <View className="flex-row items-center gap-3">
            {figures.map((figure) => (
              <View key={figure.key} className="flex-row items-center gap-1">
                <Icon set="body" name={figure.icon} size={14} />
                <Text variant="caption" className="text-ink" numberOfLines={1}>
                  {figure.value}
                </Text>
                {figure.key === 'kcal' ? <Text variant="micro">{figure.unit}</Text> : null}
              </View>
            ))}
          </View>
        </View>

        <Sparkline marks={period.marks} latest={latest} />

        {/* Tinted, as `ListRow` does it: the chevron is chrome, and the
            illustration's own blue is the one colour on the row that means
            nothing. A locked row swaps it for a padlock in the same place and
            at the same weight — the row is not decorated differently, it just
            says what is behind it. */}
        {chevron}
      </Tappable>
      {divider ? <Divider /> : null}
    </>
  )
}

/** The drawings each figure is led by, the same ones the Trends cards wear. */
type FigureIcon = 'flame-burn' | 'dumbbell' | 'weighing-scale'

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
