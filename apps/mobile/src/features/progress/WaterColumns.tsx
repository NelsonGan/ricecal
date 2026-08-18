import { View } from 'react-native'

import { cn, Text } from '@/ui'

export type WaterColumn = {
  key: string
  label: string
  /** How much of the goal this column reached, 0..1. Bounded by the caller. */
  filled: number
  /** Draws the label in water ink. True where the column met its goal. */
  reached: boolean
}

export type WaterColumnsProps = {
  columns: readonly WaterColumn[]
  height?: number
  accessibilityLabel?: string
  className?: string
}

/**
 * Water over a range: one column a bucket, each filled against the goal.
 *
 * THE COLUMN'S HEIGHT IS THE GOAL, every time, and what varies is how much of
 * it is filled. Two litres on a day you drank two litres and two litres on a
 * day you drank half of one are therefore the same height, and the difference
 * reads as an unfilled top rather than as a shorter bar — which says "short by
 * a quarter" at a glance, where a bar scaled to its own peak says nothing.
 *
 * This used to be a stack of discrete cups, one segment a glass, and it went
 * with the glasses: a millilitre figure has no natural number of boxes, and
 * rounding 1,700 ml to "seven cups" to draw it would put the old unit back on
 * the screen after taking it out of the database. A continuous fill is the
 * honest picture of a continuous quantity.
 *
 * The unfilled part is dashed for the same reason the empty part of the glass
 * on Today is: an outline is a place for something, a fill is a thing.
 */
export function WaterColumns({
  columns,
  height = 104,
  accessibilityLabel,
  className,
}: WaterColumnsProps) {
  return (
    <View
      className={cn('flex-row items-end gap-1.5', className)}
      style={{ height }}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {columns.map((column) => (
        <View key={column.key} className="h-full min-w-0 flex-1 items-center gap-1.5">
          <View className="w-full flex-1 justify-end overflow-hidden rounded-[6px] border border-water-soft-line border-dashed bg-water-soft">
            {/* A percentage height rather than a measured one, so the column
                needs no layout pass and nothing animates in from zero on a
                scroll. A day with any water at all keeps a visible sliver:
                below about 3% the fill rounds to nothing and an unlogged day
                and a mouthful draw identically. */}
            <View
              className="w-full rounded-[5px] bg-water"
              style={{ height: `${column.filled > 0 ? Math.max(3, column.filled * 100) : 0}%` }}
            />
          </View>
          {/* Fixed height whether or not this column has a label — see the note
              in `StackedBars`. */}
          <Text
            numberOfLines={1}
            variant="micro"
            className={cn('h-[14px]', column.reached && 'text-water-ink')}
          >
            {column.label}
          </Text>
        </View>
      ))}
    </View>
  )
}
