import { View } from 'react-native'

import { cn, Text } from '@/ui'

export type StackedBar = {
  key: string
  /** The axis label. One or two characters, or "Wk 3". */
  label: string
  /**
   * The column's height, in calories. NULL means nothing was logged in this
   * bucket, which is not zero calories — it draws as a stub rather than as a
   * flat bar, so a gap in the record cannot be read as a day of fasting.
   */
  value: number | null
  /** Fractions of the column's energy. Sum to one, or all zero. */
  share: { carbs: number; protein: number; fat: number }
}

export type StackedBarsProps = {
  bars: readonly StackedBar[]
  height?: number
  /** Screen-reader summary. The bars themselves are decorative. */
  accessibilityLabel?: string
  className?: string
}

/** Under a percent of the tallest column, a segment is a line. Below this it goes. */
const MIN_SEGMENT = 0.02

/**
 * Calories a day, stacked by where they came from.
 *
 * Carbs at the bottom, then protein, then fat — the order the legend reads and
 * the same order the macro bars use everywhere else in the app, so the colours
 * mean one thing throughout.
 *
 * Views rather than Skia, for the reason `BarChart` gives: a fixed handful of
 * rounded rectangles with no axes and no gestures is cheaper as flexbox than as
 * a canvas. The one thing this needs that `BarChart` cannot do is the stack,
 * which is why it is a second component rather than a prop on the first.
 */
export function StackedBars({
  bars,
  height = 132,
  accessibilityLabel,
  className,
}: StackedBarsProps) {
  const peak = Math.max(...bars.map((bar) => bar.value ?? 0), 1)

  return (
    <View
      className={cn('flex-row items-end gap-1.5', className)}
      style={{ height }}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {bars.map((bar) => {
        const total = bar.share.carbs + bar.share.protein + bar.share.fat

        return (
          <View key={bar.key} className="h-full min-w-0 flex-1 items-center gap-1.5">
            {/* The percentage is of this box rather than of the column, so a
                full-height bar plus its label cannot come out taller than the
                chart and ride up over the card's header. Same trick as
                `BarChart`. */}
            <View className="w-full flex-1 justify-end">
              {bar.value === null ? (
                <View className="h-[4%] w-full rounded-lg bg-track" />
              ) : (
                <View
                  className="w-full overflow-hidden rounded-lg"
                  // A floor of 6%: a 400-calorie day beside a 2,600-calorie one
                  // is a sliver, and a sliver reads as no data rather than as a
                  // light day.
                  style={{ height: `${Math.max(6, (bar.value / peak) * 100)}%` }}
                >
                  {total <= 0 ? (
                    // Calories logged, no macros behind them — a quick-add, or a
                    // catalogue row with only an energy figure. The height is
                    // still true, so the bar stays; only the split is unknown.
                    <View className="h-full w-full bg-track" />
                  ) : (
                    <>
                      <Segment className="bg-teh" share={bar.share.fat} />
                      <Segment className="bg-hibiscus" share={bar.share.protein} />
                      <Segment className="bg-kaya" share={bar.share.carbs} />
                    </>
                  )}
                </View>
              )}
            </View>
            <Text numberOfLines={1} variant="micro">
              {bar.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

/**
 * One macro's slice of a column.
 *
 * `flexBasis: 0` alongside `flexGrow` is what makes the three shares divide the
 * bar in proportion. Without it flexbox distributes only the leftover space, and
 * three zero-height children share all of it — which looks right until one macro
 * goes to zero and the other two stop being in the ratio they print.
 */
function Segment({ className, share }: { className: string; share: number }) {
  if (share < MIN_SEGMENT) return null
  return <View className={cn('w-full', className)} style={{ flexGrow: share, flexBasis: 0 }} />
}
