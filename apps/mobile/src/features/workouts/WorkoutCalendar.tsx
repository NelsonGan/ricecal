import { addMonths, format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { dateKey, today, useWorkoutDates } from '@/data'
import { MonthHeader } from '@/features/logging/MonthCalendar'
import { monthEnd, monthStart, monthWeeks } from '@/features/logging/month'
import { datePattern } from '@/lib/dates'
import { Card, cn, Tappable, Text } from '@/ui'

/**
 * The month, with every day that had a workout filled in. Laid out like the
 * diary's month (`features/logging/MonthCalendar.tsx`): its header, chevrons
 * and weekday row, and a row per week. Only the paging differs: workouts go
 * back further than the diary's twelve months.
 *
 * On the progress page it only reports. The Workouts tab's calendar view
 * passes `onSelect`, and a tapped day is ringed and handed back so the tab can
 * list what was done on it.
 */
export function WorkoutCalendar({
  selected = null,
  onSelect,
}: {
  selected?: string | null
  onSelect?: (date: string) => void
}) {
  const { t } = useTranslation(['workouts'])
  const now = today()
  const [month, setMonth] = useState(() => monthStart(selected ?? now))
  const to = monthEnd(month)
  const dates = useWorkoutDates(month, to).data ?? {}
  const weeks = useMemo(() => monthWeeks(month), [month])
  const isCurrent = month >= monthStart(now)
  const step = (by: -1 | 1) => setMonth(dateKey(addMonths(parseISO(month), by)))

  return (
    <Card title={t('workouts:stats.calendar')} contentClassName="gap-3">
      <MonthHeader
        month={month}
        onPrevious={() => step(-1)}
        onNext={isCurrent ? undefined : () => step(1)}
      />

      <View className="gap-1">
        {weeks.map((week) => (
          <View key={week.find(Boolean) ?? week.join()} className="flex-row">
            {week.map((key, index) => {
              if (!key) {
                // biome-ignore lint/suspicious/noArrayIndexKey: blank cells hold a place, not a day
                return <View key={`blank-${index}`} className="flex-1" />
              }
              const trained = (dates[key] ?? 0) > 0
              const picked = key === selected
              const future = key > now
              const day = format(parseISO(key), datePattern('weekdayDayMonthLong'))
              return (
                <DayCell
                  key={key}
                  date={key}
                  label={trained ? t('workouts:stats.dayTrained', { day }) : day}
                  trained={trained}
                  picked={picked}
                  isToday={key === now}
                  future={future}
                  // A day still to come has nothing to show, so it is not a button.
                  onPress={onSelect && !future ? () => onSelect(key) : undefined}
                />
              )
            })}
          </View>
        ))}
      </View>
    </Card>
  )
}

/** One day of the grid: a button when it can be picked, otherwise a label. */
function DayCell({
  date,
  label,
  trained,
  picked,
  isToday,
  future,
  onPress,
}: {
  date: string
  label: string
  trained: boolean
  picked: boolean
  isToday: boolean
  future: boolean
  onPress?: () => void
}) {
  const circle = (
    <DayCircle date={date} trained={trained} picked={picked} isToday={isToday} future={future} />
  )
  return onPress ? (
    <Tappable
      className="flex-1 items-center"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: picked }}
      accessibilityLabel={label}
    >
      {circle}
    </Tappable>
  ) : (
    // Said, not only coloured: a filled day is a trained one.
    <View className="flex-1 items-center" accessible accessibilityLabel={label}>
      {circle}
    </View>
  )
}

function DayCircle({
  date,
  trained,
  picked,
  isToday,
  future,
}: {
  date: string
  trained: boolean
  picked: boolean
  isToday: boolean
  future: boolean
}) {
  return (
    <View
      // Not flattened, for the reason a set row is not (`SetRow`): a day whose
      // workouts arrive after it is drawn turned into a green square on Android.
      collapsable={false}
      className={cn(
        'h-[34px] w-[34px] items-center justify-center rounded-full',
        // Today is a green ring; the picked day a darker one, over a pale fill
        // when it had no workout, so the two never look alike.
        trained ? 'bg-pandan' : picked ? 'bg-pandan-soft' : undefined,
        picked ? 'border-2 border-pandan-ink' : isToday && !trained && 'border-2 border-pandan',
      )}
    >
      <Text
        className={cn(
          'font-body-black text-[14px]',
          trained ? 'text-on-pandan' : future ? 'text-faint' : 'text-ink',
        )}
      >
        {format(parseISO(date), 'd')}
      </Text>
    </View>
  )
}
