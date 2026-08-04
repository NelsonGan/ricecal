import { View } from 'react-native'

import { radius, slab } from '@/theme/tokens'
import { cn } from './cn'
import { Squish } from './Squish'
import { Text } from './Text'

/**
 * How a day went, as the dot under its number says it.
 *
 * `missed` is a day that has been and gone with nothing logged; it is drawn
 * hollow rather than in a colour, because an empty ring reads as an absence and
 * every filled colour reads as a result. A day with no dot at all — today
 * before breakfast, or a day still ahead — is making no claim yet, which is not
 * the same as having missed it.
 */
export type DateStripMark = 'under' | 'over' | 'missed'

export type DateStripDay = {
  /** Weekday initial: M T W T F S S. */
  initial: string
  /** Day of month. */
  day: number
  /** How the day went. Absent draws no dot. */
  mark?: DateStripMark
  /** A day that has not happened: dimmed, and not selectable. */
  disabled?: boolean
  /** ISO date or any stable key the caller uses to identify the day. */
  key: string
  /** Read out in place of "M 21". Pass translated copy. */
  accessibilityLabel?: string
}

export type DateStripProps = {
  days: readonly DateStripDay[]
  /** `key` of the selected day. */
  value: string
  onChange: (key: string) => void
  className?: string
}

/**
 * The dot, in each of its three states and on both backgrounds.
 *
 * `under` is the one that changes colour on the selected cell: pandan on pandan
 * is not a dot. Over-goal keeps kaya on both, because there the colour IS the
 * message and a white dot would quietly delete it.
 */
const marks = {
  under: { on: 'bg-on-pandan', off: 'bg-pandan' },
  over: { on: 'bg-kaya', off: 'bg-kaya' },
  missed: { on: 'border-[1.5px] border-on-pandan/60', off: 'border-[1.5px] border-faint' },
} as const

/**
 * A week of days, as a row of tappable cells.
 *
 * "How the day went" is a dot rather than a colour change, so the selected day
 * and a day's result remain independently readable — a day is both, and the
 * cell's own colour is already spoken for by the selection.
 *
 * Presentational, and deliberately so: it is handed seven days and told which
 * is selected. Deciding what a week is, which days are in it, and whether one
 * of them beat its goal all happen in `WeekPicker`, which has the data.
 */
export function DateStrip({ days, value, onChange, className }: DateStripProps) {
  return (
    <View className={cn('flex-row gap-2', className)}>
      {days.map((day) => {
        const selected = day.key === value
        return (
          <Squish
            key={day.key}
            depth={slab.sm}
            radius={radius.sm + 2}
            containerClassName="flex-1"
            // A raised white cell rather than a flat tinted one. `track` and
            // `canvas` are two greys apart and the row read as a single block
            // with numbers on it; the slab is what makes seven separate things.
            slabClassName={selected ? 'bg-pandan-slab' : 'bg-line'}
            className={cn('items-center gap-1 py-2.5', selected ? 'bg-pandan' : 'bg-surface')}
            onPress={day.disabled ? undefined : () => onChange(day.key)}
            disabled={day.disabled}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: day.disabled }}
            accessibilityLabel={day.accessibilityLabel ?? `${day.initial} ${day.day}`}
          >
            <Text
              className={cn(
                'font-body-black text-[11px] leading-[14px]',
                selected ? 'text-on-pandan opacity-80' : 'text-faint',
                day.disabled && 'opacity-40',
              )}
            >
              {day.initial}
            </Text>
            <Text
              className={cn(
                'font-display text-[18px] leading-[20px]',
                selected ? 'text-on-pandan' : 'text-ink',
                day.disabled && 'opacity-40',
              )}
            >
              {day.day}
            </Text>
            {/* Always rendered, even with no mark: the dot is part of the
                cell's height, and a row where only some days reserve it is a
                row of two different heights. */}
            <View
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                day.mark ? marks[day.mark][selected ? 'on' : 'off'] : 'bg-transparent',
              )}
            />
          </Squish>
        )
      })}
    </View>
  )
}
