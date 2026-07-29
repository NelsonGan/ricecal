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

export type WaterTrackerProps = {
  filled: number
  goal: number
  onChange?: (filled: number) => void
  /** Names each glass to a screen reader, e.g. "Glass 3 of 8". Pass translated copy. */
  glassLabel?: (ordinal: number, goal: number) => string
  className?: string
}

/**
 * The glasses-of-water row.
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

  return (
    <View className={cn('flex-row gap-2', className)}>
      {glasses.map((glass) => (
        <Squish
          key={glass.id}
          depth={0}
          radius={12}
          containerClassName="flex-1"
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
    </View>
  )
}
