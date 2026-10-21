import { format, parseISO, startOfWeek } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, View } from 'react-native'
import { dateKey } from '@/data'
import { WEEK_STARTS_ON, weekDays, weekStarts } from '@/features/logging/week'
import { datePattern } from '@/lib/dates'
import { DateStrip, type DateStripDay } from '@/ui'

/**
 * The board's days as the Today tab draws them: a week of cells, earlier weeks
 * a swipe away. Only as far back as the board reaches (`oldest`), and never
 * ahead of today. No dots: a board is everyone's day, not the viewer's goal.
 *
 * It follows the board as well as driving it, so swiping the board back into
 * last week turns the strip to last week.
 */
export function GroupWeekStrip({
  day,
  today,
  oldest,
  onChange,
}: {
  day: string
  today: string
  oldest: string
  onChange: (day: string) => void
}) {
  const { t } = useTranslation('logging')
  const [width, setWidth] = useState(0)
  const list = useRef<FlatList<string>>(null)
  const weeks = useMemo(() => {
    const first = dateKey(startOfWeek(parseISO(oldest), { weekStartsOn: WEEK_STARTS_ON }))
    return weekStarts(today).filter((start) => start >= first)
  }, [today, oldest])
  const week = dateKey(startOfWeek(parseISO(day), { weekStartsOn: WEEK_STARTS_ON }))
  const page = Math.max(0, weeks.indexOf(week))
  const initial = useRef(page).current

  useEffect(() => {
    if (width > 0) list.current?.scrollToIndex({ index: page, animated: true })
  }, [page, width])

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <FlatList
          ref={list}
          data={weeks}
          keyExtractor={(start) => start}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initial}
          getItemLayout={(_data, index) => ({ length: width, offset: width * index, index })}
          onScrollToIndexFailed={({ index }) =>
            list.current?.scrollToOffset({ offset: width * index, animated: false })
          }
          initialNumToRender={1}
          windowSize={2}
          renderItem={({ item }) => {
            const cells: DateStripDay[] = weekDays(item).map((date) => {
              const at = parseISO(date)
              const ahead = date > today
              return {
                key: date,
                initial: format(at, 'EEEEE'),
                day: at.getDate(),
                disabled: ahead || date < oldest,
                accessibilityLabel: t(`week.a11y.${ahead ? 'ahead' : 'plain'}`, {
                  day: format(at, datePattern('weekdayDayMonthLong')),
                }),
              }
            })
            return (
              <View style={{ width }}>
                <DateStrip days={cells} value={day} onChange={onChange} />
              </View>
            )
          }}
        />
      ) : null}
    </View>
  )
}
