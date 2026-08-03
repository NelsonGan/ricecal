import { View } from 'react-native'

import { cn, Text } from '@/ui'

export type BalanceBar = {
  key: string
  label: string
  /** Null where nothing was logged. Drawn as a stub, never as zero. */
  eaten: number | null
  /** Null where the store reported no burn for the day. */
  burned: number | null
}

export type BalanceBarsProps = {
  bars: readonly BalanceBar[]
  height?: number
  accessibilityLabel?: string
  className?: string
}

/**
 * Eaten against burned, a pair of columns a day.
 *
 * WHY A PAIR AND NOT A DIVERGING BAR
 *
 * A single bar above and below a line — surplus up, deficit down — is the
 * compact version and it was the first attempt. It hides the thing people want
 * from this chart: a 300 deficit on a 1,400-calorie day and a 300 deficit on a
 * 2,900-calorie day are the same bar, and they are not the same week. Two
 * columns keep the magnitudes visible and let the gap between them carry the
 * balance, which is the reading the design's headline number describes.
 *
 * BOTH COLUMNS SHARE ONE SCALE. Scaling each series to its own peak would make
 * a day where eating exactly matched burning look like a day of two different
 * heights, which is the one thing this chart must never do.
 */
export function BalanceBars({
  bars,
  height = 148,
  accessibilityLabel,
  className,
}: BalanceBarsProps) {
  const peak = Math.max(...bars.flatMap((bar) => [bar.eaten ?? 0, bar.burned ?? 0]), 1)

  return (
    <View
      className={cn('flex-row items-end gap-1.5', className)}
      style={{ height }}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {bars.map((bar) => (
        <View key={bar.key} className="h-full min-w-0 flex-1 items-center gap-1.5">
          {/* The percentages are of this box rather than of the chart, so a
              full-height column plus its label cannot exceed the card. Same
              trick as `StackedBars`. */}
          <View className="w-full flex-1 flex-row items-end justify-center gap-[3px]">
            <Column value={bar.eaten} peak={peak} fill="bg-kaya" />
            <Column value={bar.burned} peak={peak} fill="bg-pandan" />
          </View>
          <Text numberOfLines={1} variant="micro" className="h-[14px]">
            {bar.label}
          </Text>
        </View>
      ))}
    </View>
  )
}

function Column({ value, peak, fill }: { value: number | null; peak: number; fill: string }) {
  // A stub for an unknown day, in the track colour. Distinct from a short bar,
  // which is a real small number — the difference between "nothing logged" and
  // "a light day" is the difference between two charts.
  if (value == null) {
    return <View className="h-[4%] flex-1 rounded-t-md bg-track" />
  }

  return (
    <View
      className={cn('flex-1 rounded-t-md', fill)}
      style={{ height: `${Math.max(4, (value / peak) * 100)}%` }}
    />
  )
}

/** The small key under the chart. Two entries, so not worth a generic legend. */
export function BalanceLegend({
  eatenLabel,
  burnedLabel,
  className,
}: {
  eatenLabel: string
  burnedLabel: string
  className?: string
}) {
  return (
    <View className={cn('flex-row items-center gap-4', className)}>
      <Swatch className="bg-kaya" label={eatenLabel} />
      <Swatch className="bg-pandan" label={burnedLabel} />
    </View>
  )
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={cn('h-2.5 w-2.5 rounded-full', className)} />
      <Text variant="micro">{label}</Text>
    </View>
  )
}
