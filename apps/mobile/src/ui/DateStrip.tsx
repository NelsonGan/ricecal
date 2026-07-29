import { View } from 'react-native'

import { radius, slab } from '@/theme/tokens'
import { cn } from './cn'
import { Squish } from './Squish'
import { Text } from './Text'

export type DateStripDay = {
  /** Weekday initial: M T W T F S S. */
  initial: string
  /** Day of month. */
  day: number
  /** True when the day was fully logged — draws the dot. */
  logged?: boolean
  /** ISO date or any stable key the caller uses to identify the day. */
  key: string
}

export type DateStripProps = {
  days: readonly DateStripDay[]
  /** `key` of the selected day. */
  value: string
  onChange: (key: string) => void
  className?: string
}

/**
 * A week of days across the top of a diary screen.
 *
 * "Fully logged" is a dot rather than a colour change, so the selected day and
 * a logged day remain independently readable — a day can be both, and colour
 * alone cannot say so.
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
            slabClassName={selected ? 'bg-pandan-slab' : 'bg-transparent'}
            className={cn('items-center gap-1 py-2.5', selected ? 'bg-pandan' : 'bg-track')}
            onPress={() => onChange(day.key)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${day.initial} ${day.day}${day.logged ? ', logged' : ''}`}
          >
            <Text
              className={cn(
                'font-body-black text-[11px] leading-[14px]',
                selected ? 'text-on-pandan opacity-80' : 'text-faint',
              )}
            >
              {day.initial}
            </Text>
            <Text
              className={cn(
                'font-display text-[18px] leading-[20px]',
                selected ? 'text-on-pandan' : 'text-ink',
              )}
            >
              {day.day}
            </Text>
            <View
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                day.logged ? (selected ? 'bg-on-pandan' : 'bg-pandan') : 'bg-transparent',
              )}
            />
          </Squish>
        )
      })}
    </View>
  )
}
