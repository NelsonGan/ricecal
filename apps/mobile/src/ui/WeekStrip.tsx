import { View } from 'react-native'

import { radius, slab } from '@/theme/tokens'
import { cn } from './cn'
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

/**
 * A glass, as a share of the row.
 *
 * Eight of these plus the seven gaps `justify-between` puts between them come to
 * the full width, which is the arrangement this had when it could not wrap. Fixed
 * rather than `flex-1` because a glass has to be the same size on a short second
 * row as on a full first one.
 */
const GLASS_WIDTH = 'w-[10.5%]'

export type WaterTrackerProps = {
  filled: number
  goal: number
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
  onChange,
  glassLabel = (ordinal, total) => `Glass ${ordinal} of ${total}`,
  className,
}: WaterTrackerProps) {
  // A glass has no identity beyond its position, so the position becomes its
  // id here rather than being passed as a key at the call site.
  const glasses = Array.from({ length: goal }, (_, index) => ({
    id: `glass-${index}`,
    ordinal: index + 1,
    isFilled: index < filled,
    /** Tapping the last filled glass empties it; any other fills up to it. */
    next: index === filled - 1 ? index : index + 1,
  }))

  // Blank cells to finish the row, keyed by position for the same reason the
  // glasses are: a spacer has no identity beyond which column it holds.
  const fillers = Array.from(
    { length: (GLASSES_PER_ROW - (goal % GLASSES_PER_ROW)) % GLASSES_PER_ROW },
    (_, index) => `gap-${index}`,
  )

  return (
    <View className={cn('flex-row flex-wrap justify-between gap-y-2', className)}>
      {glasses.map((glass) => (
        <Squish
          key={glass.id}
          depth={0}
          radius={12}
          containerClassName={GLASS_WIDTH}
          className={cn(
            'h-[60px]',
            glass.isFilled
              ? 'bg-water'
              : 'border-[3px] border-dashed border-water-soft-line bg-water-soft',
          )}
          onPress={onChange ? () => onChange(glass.next) : undefined}
          accessibilityRole={onChange ? 'button' : undefined}
          accessibilityLabel={glassLabel(glass.ordinal, goal)}
          accessibilityState={{ selected: glass.isFilled }}
        />
      ))}

      {/* `justify-between` sizes the gaps from whatever is on a line, so a goal of
          twelve would otherwise spread its last four glasses across the full width
          and line them up with none of the eight above. These draw nothing and only
          hold columns. */}
      {fillers.map((id) => (
        <View key={id} className={GLASS_WIDTH} />
      ))}
    </View>
  )
}
