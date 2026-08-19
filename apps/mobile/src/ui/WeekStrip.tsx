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
