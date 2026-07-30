import { View } from 'react-native'

import { cn, Text } from '@/ui'

export type CupBar = {
  key: string
  label: string
  /** Cups reached. Rounded to whole cups by the caller: a segment IS one cup. */
  cups: number
  /** Draws the label in water ink. True where the column met its goal. */
  reached: boolean
}

export type CupBarsProps = {
  bars: readonly CupBar[]
  /** How many segments a column has. The daily goal, not the tallest column. */
  goal: number
  height?: number
  accessibilityLabel?: string
  className?: string
}

/**
 * Sixteen is the highest goal the tracker allows, and sixteen segments in a
 * 104pt column are 4pt each — a bar of ticks, but still legible as one. Past
 * that the segments stop being countable, so the column becomes a plain bar.
 */
const MAX_SEGMENTS = 16

/**
 * Water, as cups against a goal rather than as a height.
 *
 * The design's one insistence: a water column is not a bar chart column. Its
 * height is always the goal, and what varies is how much of it is filled — so
 * eight cups on a day you drank eight and eight cups on a day you drank three
 * are the same height, and the difference is visible as unfilled cups rather
 * than as a shorter bar. That reads as "three short" at a glance, which a bar
 * scaled to its own peak does not.
 *
 * The unfilled cups are dashed for the same reason the empty glasses on Today
 * are: an outline is a place for something, a fill is a thing.
 */
export function CupBars({ bars, goal, height = 104, accessibilityLabel, className }: CupBarsProps) {
  const segments = Math.max(1, Math.min(goal, MAX_SEGMENTS))

  // A cup has no identity beyond its position, so the position becomes its id
  // here rather than being passed as a key at the point of render — the same
  // shape `WaterTracker` uses for the glasses on Today, and for the same reason:
  // the list never reorders, only its fill changes.
  const cups = Array.from({ length: segments }, (_, index) => ({ id: `cup-${index}`, index }))

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
          {/* Column-reverse so the first cup is the bottom one. Filling upward
              is the same direction the glasses on Today fill in, and the same
              direction a glass fills in life. */}
          <View className="w-full flex-1 flex-col-reverse" style={{ gap: 2 }}>
            {cups.map((cup) => (
              <View
                key={cup.id}
                className={cn(
                  'w-full flex-1 rounded-[3px]',
                  cup.index < bar.cups
                    ? 'bg-water'
                    : 'border border-dashed border-water-soft-line bg-water-soft',
                )}
              />
            ))}
          </View>
          <Text
            numberOfLines={1}
            variant="micro"
            className={bar.reached ? 'text-water-ink' : undefined}
          >
            {bar.label}
          </Text>
        </View>
      ))}
    </View>
  )
}
