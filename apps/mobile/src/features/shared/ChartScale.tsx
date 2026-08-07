import type { ReactNode } from 'react'
import { View } from 'react-native'

import { cn, Text } from '@/ui'

/**
 * The label row under a chart's columns, and the gap above it.
 *
 * Every chart in the app is built the same way — a `flex-1` plot box over a
 * 14pt label, `gap-1.5` between them — so the box a tick has to line up with is
 * always the chart's height less these two. Stated here rather than measured on
 * layout: a measured axis draws its first frame against a height of zero, which
 * is a visible flicker on a tab the user switches between.
 */
const LABEL_ROW = 14
const LABEL_GAP = 6

/** Wide enough for "12.5k" in `micro`, and no wider — the gutter is width the bars lose. */
const GUTTER = 32

export type AxisTick = {
  /** Where the tick sits in the plot box: 1 is the top, 0 the baseline. */
  at: number
  label: string
}

export type ChartScaleProps = {
  /** The chart's overall height, label row included. */
  height: number
  /** Top-first, and each one gets a hairline unless `lines` is off. */
  ticks: readonly AxisTick[]
  /**
   * Hairlines across the plot behind the bars.
   *
   * Off where the columns are already divided into readable units — a water
   * column is a stack of cups, and ruling it as well says the same thing twice.
   */
  lines?: boolean
  /** The gap between the columns, which is the chart's own business. */
  rowClassName?: string
  /** Screen-reader summary. Collapses the ticks and the bars into one node. */
  accessibilityLabel?: string
  className?: string
  children: ReactNode
}

/**
 * The y-axis every bar chart here hangs in.
 *
 * The charts were drawn without one for a long time and each of them scaled to
 * its own tallest column, so every chart looked the same shape whatever it
 * held: a week averaging 1,200 kcal and a week averaging 2,900 both peaked at
 * the top of the card. The heights were only ever comparable WITHIN one chart,
 * and nothing on screen said what any of them were worth.
 *
 * So the ticks are the point, and the hairlines are what makes them readable —
 * a number in the gutter with nothing running from it has to be eyeballed
 * across the width of the card. They are drawn BEFORE the columns so the bars
 * paint over them; a line across the face of a bar reads as a segment boundary,
 * which is what `StackedBars` uses that language for.
 */
export function ChartScale({
  height,
  ticks,
  lines = true,
  rowClassName,
  accessibilityLabel,
  className,
  children,
}: ChartScaleProps) {
  const plot = Math.max(0, height - LABEL_ROW - LABEL_GAP)

  return (
    <View
      className={cn('flex-row gap-2', className)}
      style={{ height }}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={{ height: plot, width: GUTTER }}>
        {ticks.map((tick) => (
          <Text
            key={tick.label + tick.at}
            variant="micro"
            numberOfLines={1}
            className="absolute right-0 text-right"
            // Centred on its own hairline, then kept inside the plot box: the
            // topmost tick would otherwise sit half above the chart and crowd
            // whatever the card has in its header.
            style={{ top: clamp((1 - tick.at) * plot - LABEL_ROW / 2, 0, plot - LABEL_ROW) }}
          >
            {tick.label}
          </Text>
        ))}
      </View>

      <View className="min-w-0 flex-1">
        {lines
          ? ticks.map((tick) => (
              <View
                key={tick.label + tick.at}
                className="absolute inset-x-0 h-px bg-line"
                style={{ top: (1 - tick.at) * plot }}
              />
            ))
          : null}

        <View className={cn('h-full flex-row items-end', rowClassName)}>{children}</View>
      </View>
    </View>
  )
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high))
