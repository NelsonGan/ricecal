import { View } from 'react-native'

import type { ActivityHour } from '@/data'
import { cn, Text } from '@/ui'
import { count, hourLabel } from './format'

/**
 * How coarse a day's hourly data may be before an hourly chart lies about it.
 *
 * Samsung Health writes steps in blocks — a morning lump, an afternoon lump —
 * rather than by the hour. Drawn as twenty-four columns, three of them are
 * skyscrapers and twenty-one are empty, which reads as "you sat still from 9 to
 * 2" rather than "your phone did not record when". Below this many distinct
 * hours the caller draws three blocks instead, which is the N5 screen.
 */
export const HOURLY_MIN_BUCKETS = 6

export type HourBarsProps = {
  hours: readonly ActivityHour[]
  /** The three-block fallback, when there is not enough shape for an hourly one. */
  blocks?: boolean
  blockLabels?: readonly [string, string, string]
  height?: number
  accessibilityLabel?: string
  className?: string
}

/** Morning ends, afternoon ends. Evening is the rest. */
const BLOCK_EDGES = [12, 18] as const

/**
 * A day's steps, by hour or by third.
 *
 * Views rather than Skia, for the same reason as `StackedBars`: two dozen
 * rounded rectangles with no axis and no gesture is cheaper as flexbox than as
 * a canvas.
 *
 * Empty hours are drawn as an empty column rather than skipped. The gaps ARE
 * the shape — a day with nothing before 6am and nothing after 9pm is a day with
 * a beginning and an end, and closing those gaps would make every day look like
 * continuous motion.
 */
export function HourBars({
  hours,
  blocks = false,
  blockLabels,
  height = 120,
  accessibilityLabel,
  className,
}: HourBarsProps) {
  const columns = blocks ? toBlocks(hours, blockLabels) : toHours(hours)
  const peak = Math.max(...columns.map((column) => column.steps), 1)

  return (
    <View
      className={cn('flex-row items-end', blocks ? 'gap-2.5' : 'gap-[3px]', className)}
      style={{ height }}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {columns.map((column) => (
        <View key={column.key} className="h-full min-w-0 flex-1 items-center gap-1.5">
          <View className="w-full flex-1 justify-end">
            <View
              className={cn('w-full rounded-md', column.steps > 0 ? 'bg-pandan' : 'bg-track')}
              // A floor of 3% so an empty hour is still a visible tick on the
              // baseline rather than nothing at all — which is what makes the
              // row read as a timeline instead of a scattering of bars.
              style={{ height: `${Math.max(3, (column.steps / peak) * 100)}%` }}
            />
          </View>
          {/* An hourly label OVERFLOWS its column; a block label does not.
              Twenty-four columns across a phone is about fifteen points each,
              and "12pm" needs forty — constrained to the column it rendered as
              "1..", which is not a time. So it is an absolutely positioned
              fixed-width child, centred on the column and spilling over its
              unlabelled neighbours, which is exactly what an axis label should
              do. React Native does not clip overflow, so nothing opts in.

              With three blocks the opposite is true: the column is a third of
              the screen and 44pt is far NARROWER than it, which is what
              ellipsised "Afternoon" to "Aftern...". Those labels take the
              column's own width.

              The box keeps its 14pt height whether or not this column is
              labelled, for the reason `StackedBars` gives: an unlabelled column
              would otherwise give its bar more room than its neighbours, and
              the tops would stop being comparable. */}
          <View className="h-[14px] w-full items-center">
            {column.label ? (
              <Text
                numberOfLines={1}
                variant="micro"
                className={blocks ? 'w-full text-center' : 'absolute w-[44px] text-center'}
              >
                {column.label}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  )
}

type Column = { key: string; label: string; steps: number }

/**
 * Twenty-four columns, labelled sparsely.
 *
 * Every third hour gets a label. Twenty-four labels do not fit across a phone
 * at any size that can be read, and every SIXTH is too few to place the middle
 * of the day — the chart's whole job is letting someone point at 3pm.
 */
function toHours(hours: readonly ActivityHour[]): Column[] {
  const byHour = new Map(hours.map((hour) => [hour.hour, hour.steps]))
  return Array.from({ length: 24 }, (_, hour) => ({
    key: String(hour),
    label: hour % 6 === 0 && hour !== 0 ? hourLabel(hour) : '',
    steps: byHour.get(hour) ?? 0,
  }))
}

function toBlocks(
  hours: readonly ActivityHour[],
  labels: readonly [string, string, string] = ['Morning', 'Afternoon', 'Evening'],
): Column[] {
  const totals = [0, 0, 0]
  for (const hour of hours) {
    const index = hour.hour < BLOCK_EDGES[0] ? 0 : hour.hour < BLOCK_EDGES[1] ? 1 : 2
    totals[index] += hour.steps
  }
  return totals.map((steps, index) => ({
    key: labels[index],
    label: labels[index],
    steps,
  }))
}

/** Whether there is enough shape in a day to draw it by the hour. */
export const hasHourlyShape = (hours: readonly ActivityHour[]): boolean =>
  hours.filter((hour) => hour.steps > 0).length >= HOURLY_MIN_BUCKETS

/** For the chart's screen-reader summary. */
export const hourlySummary = (hours: readonly ActivityHour[]): string =>
  `${count(hours.reduce((sum, hour) => sum + hour.steps, 0))} steps`
