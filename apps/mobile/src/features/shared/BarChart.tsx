import { View } from 'react-native'

import { cn, Text } from '@/ui'
import { ChartScale } from './ChartScale'
import { axisNumber, axisTicks, niceCeiling } from './scale'

export type Bar = {
  key: string
  /** The axis label under the bar. One or two characters. */
  label: string
  value: number
  /** Draws this bar in the accent colour. Usually the newest or the current one. */
  highlight?: boolean
}

export type BarChartProps = {
  bars: readonly Bar[]
  /** Accent for highlighted bars. */
  tone?: 'pandan' | 'hibiscus' | 'water' | 'kaya'
  /**
   * Where the bars start from.
   *
   * `zero` is right for anything counted from nothing — calories, minutes,
   * glasses. `range` is right for a measurement that never approaches zero: a
   * weight chart drawn from 0 makes 68.4 kg and 70.2 kg look identical, which
   * is the one thing the chart exists to tell apart.
   */
  scale?: 'zero' | 'range'
  height?: number
  /** How the y-axis ticks read. Defaults to "820" / "1.2k". */
  format?: (value: number) => string
  /** Screen-reader summary. The bars themselves are decorative. */
  accessibilityLabel?: string
  className?: string
}

const fills = {
  pandan: 'bg-pandan',
  hibiscus: 'bg-hibiscus',
  water: 'bg-water',
  kaya: 'bg-kaya',
} as const

/**
 * A plain column chart.
 *
 * Deliberately not victory-native: every use here is a fixed handful of bars
 * with no axes, no tooltips and no gestures, and a flex row of rounded Views
 * renders that far more cheaply than a Skia canvas would.
 */
export function BarChart({
  bars,
  tone = 'pandan',
  scale = 'zero',
  height = 110,
  format = axisNumber,
  accessibilityLabel,
  className,
}: BarChartProps) {
  const values = bars.map((bar) => bar.value)
  const low = Math.min(...values)
  // Rounded up on a zero scale so the top tick is a figure worth printing. On a
  // range scale the top has to stay the real maximum: the whole point of that
  // scale is that the span is narrow, and rounding 70.2 kg up to 80 would flatten
  // the chart it was chosen to keep readable.
  const peak = scale === 'zero' ? niceCeiling(Math.max(...values, 1)) : Math.max(...values, 1)

  // A tenth of the spread below the smallest value, so the shortest bar is a
  // visible stub rather than nothing.
  const floor = scale === 'range' ? low - (peak - low) * 0.1 - 0.001 : 0
  const span = peak - floor || 1

  // On a range scale the two figures that mean anything are the ends of the
  // data, not fractions of an axis that starts nowhere in particular.
  const ticks =
    scale === 'zero'
      ? axisTicks(peak, { format })
      : [
          { at: 1, label: format(peak) },
          { at: (low - floor) / span, label: format(low) },
        ]

  return (
    <ChartScale
      height={height}
      ticks={ticks}
      rowClassName="gap-1.5"
      accessibilityLabel={accessibilityLabel}
      className={className}
    >
      {bars.map((bar) => (
        <View key={bar.key} className="h-full min-w-0 flex-1 items-center gap-1.5">
          {/* The bar's percentage is of this box, not of the column: measuring
              it against the column would make a full bar plus its label taller
              than the chart, and it would ride up over whatever sits above. */}
          <View className="w-full flex-1 justify-end">
            <View
              className={cn('w-full rounded-lg', bar.highlight ? fills[tone] : 'bg-track')}
              // A floor of 4% keeps a zero-value day visible as a stub rather
              // than vanishing, which reads as missing data.
              style={{ height: `${Math.max(4, ((bar.value - floor) / span) * 100)}%` }}
            />
          </View>
          <Text numberOfLines={1} variant="micro">
            {bar.label}
          </Text>
        </View>
      ))}
    </ChartScale>
  )
}
