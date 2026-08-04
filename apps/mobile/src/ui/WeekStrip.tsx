import { View } from 'react-native'

import { radius, slab } from '@/theme/tokens'
import { cn } from './cn'
import { Skeleton } from './Skeleton'
import { Squish } from './Squish'
import { Text } from './Text'

/**
 * How a day went.
 *
 * `over` is deliberately not a failure state: a kaya square still counts toward
 * the streak, because the streak rewards showing up rather than being perfect.
 */
export type DayStatus = 'logged' | 'over' | 'today' | 'empty'

const statuses = {
  logged: { fill: 'bg-pandan', slab: 'bg-pandan-slab', label: 'text-muted' },
  over: { fill: 'bg-kaya', slab: 'bg-kaya-slab', label: 'text-muted' },
  today: {
    fill: 'bg-surface border-[3px] border-pandan',
    slab: 'bg-pandan-soft-line',
    label: 'text-pandan-ink',
  },
  empty: { fill: 'bg-track', slab: 'bg-transparent', label: 'text-faint' },
} as const

export type WeekDay = {
  /**
   * Stable identity — an ISO date. Two Tuesdays in a fortnight view share an
   * initial and a status, so the letter alone cannot key the list.
   */
  key: string
  /** Single letter under the square: M T W T F S S. */
  initial: string
  status: DayStatus
  /** Read out by a screen reader, e.g. "Monday, logged". */
  accessibilityLabel?: string
}

export type WeekStripProps = {
  days: readonly WeekDay[]
  onSelectDay?: (key: string) => void
  className?: string
}

/** The seven-square streak row. */
export function WeekStrip({ days, onSelectDay, className }: WeekStripProps) {
  return (
    <View className={cn('flex-row gap-2', className)}>
      {days.map((day) => {
        const palette = statuses[day.status]
        return (
          <View key={day.key} className="flex-1 items-center gap-2">
            <Squish
              depth={slab.sm}
              radius={radius.sm + 2}
              containerClassName="w-full"
              slabClassName={palette.slab}
              className={cn('aspect-square w-full', palette.fill)}
              onPress={onSelectDay ? () => onSelectDay(day.key) : undefined}
              accessibilityRole={onSelectDay ? 'button' : undefined}
              accessibilityLabel={day.accessibilityLabel ?? `${day.initial}, ${day.status}`}
            />
            <Text variant="caption" className={palette.label}>
              {day.initial}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

/**
 * Glasses to a row before the tracker wraps.
 *
 * The goal goes up to 16, and sixteen glasses sharing one row are 14pt wide — a
 * row of slivers rather than something to tap. Eight is what the default goal
 * already showed at full width, so the common case is one row and unchanged.
 */
const GLASSES_PER_ROW = 8

export type WaterTrackerProps = {
  filled: number
  goal: number
  /**
   * The count is not known yet.
   *
   * Its own state rather than something the caller place-holds around, because
   * an empty glass is a STATEMENT — "no water yet today" — and a tracker
   * rendered at zero while the day is still loading says it out loud. The grid
   * is laid out from the goal, which is known first, so the placeholder is
   * exactly the size the real thing will be and nothing moves when it arrives.
   */
  loading?: boolean
  onChange?: (filled: number) => void
  /** Names each glass to a screen reader, e.g. "Glass 3 of 8". Pass translated copy. */
  glassLabel?: (ordinal: number, goal: number) => string
  className?: string
}

/**
 * The glasses-of-water grid.
 *
 * Tapping a glass fills up to and including it; tapping the last filled glass
 * empties it. That is the interaction the design describes ("tap again to
 * undo") and it means going from 5 to 2 is one tap, not three.
 */
export function WaterTracker({
  filled,
  goal,
  loading = false,
  onChange,
  glassLabel = (ordinal, total) => `Glass ${ordinal} of ${total}`,
  className,
}: WaterTrackerProps) {
  // Chunked into rows here rather than left to `flex-wrap`, which decided the
  // wrap point from whatever happened to fit: a goal of sixteen came out as
  // nine glasses and then seven, in two rows whose columns lined up with
  // nothing. Every row now holds the same number of columns, and a short last
  // row keeps them — the leftover glasses sit under the ones above rather than
  // being spread across the width.
  const rows = Array.from({ length: Math.ceil(goal / GLASSES_PER_ROW) }, (_, row) =>
    Array.from({ length: GLASSES_PER_ROW }, (_, column) => {
      const index = row * GLASSES_PER_ROW + column
      if (index >= goal) return { id: `pad-${row}-${column}`, pad: true as const }
      return {
        id: `glass-${index}`,
        pad: false as const,
        ordinal: index + 1,
        isFilled: index < filled,
        /** Tapping the last filled glass empties it; any other fills up to it. */
        next: index === filled - 1 ? index : index + 1,
      }
    }),
  )

  return (
    <View className={cn('gap-2', className)}>
      {rows.map((row) => (
        <View key={row[0].id} className="flex-row items-center gap-2">
          {row.map((cell) =>
            cell.pad ? (
              // Holds a column so the row above and the row below line up. A
              // spacer draws nothing and is invisible to a screen reader.
              <View key={cell.id} className="flex-1" />
            ) : loading ? (
              // 12, the same literal the glass gives `Squish`, so the
              // placeholder and the thing it stands in for are the same shape.
              <Skeleton
                key={cell.id}
                height={60}
                rounded={false}
                className="flex-1 rounded-[12px]"
              />
            ) : (
              <Squish
                key={cell.id}
                depth={0}
                radius={12}
                containerClassName="flex-1"
                className={cn(
                  'h-[60px]',
                  cell.isFilled
                    ? 'bg-water'
                    : 'border-[3px] border-dashed border-water-soft-line bg-water-soft',
                )}
                onPress={onChange ? () => onChange(cell.next) : undefined}
                accessibilityRole={onChange ? 'button' : undefined}
                accessibilityLabel={glassLabel(cell.ordinal, goal)}
                accessibilityState={{ selected: cell.isFilled }}
              />
            ),
          )}
        </View>
      ))}
    </View>
  )
}
