import { View } from 'react-native'

import { cn, Text } from '@/ui'

export type PeriodBar = {
  key: string
  /** Under the bar: "3 Aug", "Jul". */
  label: string
  /** Over it, already shortened: "1.96k". Empty for a period with nothing in it. */
  value: string
  /** How tall, 0 to 1. Zero draws the stub that means "nothing logged". */
  height: number
  current?: boolean
}

export type PeriodBarsProps = {
  bars: readonly PeriodBar[]
  height?: number
  accessibilityLabel?: string
  /** Layout. Lands on the box the card measures, as everywhere else here. */
  className?: string
}

/**
 * This period against the four before it.
 *
 * Not `BarChart`, and the difference is the figure over each column. Five weeks
 * of somebody's eating land within a few hundred calories of each other, so the
 * bars alone answer "about the same" and nothing more precise — the number is
 * what makes the chart worth the space, and the bar is what makes the number
 * comparable at a glance.
 *
 * The heights come from the caller rather than from the values, because they are
 * measured against the SPREAD of the five rather than from zero. Drawn from
 * zero, 1,770 and 1,880 are two bars the eye reads as identical, which is the
 * one thing this chart exists to tell apart.
 */
export function PeriodBars({ bars, height = 108, accessibilityLabel, className }: PeriodBarsProps) {
  return (
    <View
      className={cn('flex-row items-end gap-2', className)}
      style={{ height }}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {bars.map((bar) => (
        <View key={bar.key} className="h-full min-w-0 flex-1 items-center gap-1">
          {/* No `adjustsFontSizeToFit`, deliberately. `micro` carries its own
              line height, and the two together are a long-standing React Native
              bug that shrinks the text even when there is room — see the note in
              `StatTile`. These labels are five characters at most and a fifth of
              a card is plenty for them. */}
          <Text variant="micro" numberOfLines={1} className={cn(bar.current && 'text-pandan-ink')}>
            {bar.value}
          </Text>

          {/* The percentage is of this box rather than of the column, so a
              full-height bar plus the labels either side of it cannot come out
              taller than the chart. Same trick as `BarChart`. */}
          <View className="w-full flex-1 justify-end">
            <View
              // `line-strong` rather than `track` for the others: five pale
              // columns on a white card read as an empty chart, and the one
              // green bar has to be read AGAINST them rather than alone.
              className={cn('w-full rounded-lg', bar.current ? 'bg-pandan' : 'bg-line-strong')}
              // A floor, so a period with nothing logged is a visible stub
              // rather than an absence the eye reads as a rendering fault.
              style={{ height: `${Math.max(6, bar.height * 100)}%` }}
            />
          </View>

          <Text variant="micro" numberOfLines={1} className={cn(bar.current && 'text-ink')}>
            {bar.label}
          </Text>
        </View>
      ))}
    </View>
  )
}
