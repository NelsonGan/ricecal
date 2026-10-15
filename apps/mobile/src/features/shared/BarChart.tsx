import { View } from 'react-native'

import { cn, Tappable, Text } from '@/ui'

export type Bar = {
  key: string
  /** The axis label under the bar. One or two characters. Left out, no label row. */
  label?: string
  value: number
  /** Draws this bar in the accent colour. Usually the newest or the current one. */
  highlight?: boolean
}

export type BarChartProps = {
  bars: readonly Bar[]
  /** Accent for highlighted bars. */
  tone?: 'pandan' | 'hibiscus' | 'water' | 'kaya'
  /**
   * How the bars that are not highlighted are drawn. `track` greys them all;
   * `soft` gives any with a value a pale wash of the tone, so a week with
   * something in it stands apart from an empty one.
   */
  others?: 'track' | 'soft'
  /**
   * Where the bars start from.
   *
   * `zero` is right for anything counted from nothing — calories, minutes,
   * millilitres. `range` is right for a measurement that never approaches zero: a
   * weight chart drawn from 0 makes 68.4 kg and 70.2 kg look identical, which
   * is the one thing the chart exists to tell apart.
   */
  scale?: 'zero' | 'range'
  height?: number
  /**
   * Makes the bars tappable: the tapped one is drawn in the accent and handed
   * back, and tapping it again hands back null. The caller says what it was,
   * usually in the headline the chart sits under.
   */
  selected?: number | null
  onSelect?: (index: number | null) => void
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

const softFills = {
  pandan: 'bg-pandan-soft-line',
  hibiscus: 'bg-hibiscus-soft-line',
  water: 'bg-water-soft-line',
  kaya: 'bg-kaya-soft-line',
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
  others = 'track',
  scale = 'zero',
  height = 110,
  selected = null,
  onSelect,
  accessibilityLabel,
  className,
}: BarChartProps) {
  const values = bars.map((bar) => bar.value)
  const peak = Math.max(...values, 1)
  const low = Math.min(...values)

  // A tenth of the spread below the smallest value, so the shortest bar is a
  // visible stub rather than nothing.
  const floor = scale === 'range' ? low - (peak - low) * 0.1 - 0.001 : 0
  const span = peak - floor || 1

  return (
    <View
      className={cn('flex-row items-end gap-1.5', className)}
      style={{ height }}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {bars.map((bar, index) => (
        <Tappable
          key={bar.key}
          disabled={!onSelect}
          onPress={() => onSelect?.(selected === index ? null : index)}
          className="h-full min-w-0 flex-1 items-center gap-1.5"
          accessibilityRole={onSelect ? 'button' : undefined}
          accessibilityState={onSelect ? { selected: selected === index } : undefined}
          accessibilityLabel={onSelect ? (bar.label ?? bar.key) : undefined}
        >
          {/* The bar's percentage is of this box, not of the column: measuring
              it against the column would make a full bar plus its label taller
              than the chart, and it would ride up over whatever sits above. */}
          <View className="w-full flex-1 justify-end">
            <View
              className={cn(
                'w-full rounded-lg',
                (selected === null ? bar.highlight : selected === index)
                  ? fills[tone]
                  : others === 'soft' && bar.value > 0
                    ? softFills[tone]
                    : 'bg-track',
              )}
              // A floor of 4% keeps a zero-value day visible as a stub rather
              // than vanishing, which reads as missing data.
              style={{ height: `${Math.max(4, ((bar.value - floor) / span) * 100)}%` }}
            />
          </View>
          {bar.label !== undefined ? (
            <Text numberOfLines={1} variant="micro">
              {bar.label}
            </Text>
          ) : null}
        </Tappable>
      ))}
    </View>
  )
}
