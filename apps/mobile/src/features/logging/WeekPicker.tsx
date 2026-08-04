import { format, parseISO } from 'date-fns'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, View } from 'react-native'

import {
  useDayMarks,
  usePrefetchActivityDays,
  usePrefetchDays,
  useSelectedDate,
  useSettings,
} from '@/data'
import { DateStrip, type DateStripDay } from '@/ui'
import { markFor, weekDays, weekStarts } from './week'

type WeekProps = {
  /** Monday of this week, `yyyy-MM-dd`. */
  start: string
  width: number
  selected: string
  today: string
  onSelect: (date: string) => void
}

/**
 * One page: seven cells, the query behind their dots, and the days themselves.
 *
 * The queries live here rather than in the pager so that swiping back a year
 * does not fetch a year. A week is asked for when it is rendered and
 * react-query keeps it, so the swipe back is a request and the swipe forward
 * is not.
 *
 * WHY THE PAGE FETCHES THE DAYS AND NOT ONLY THE DOTS
 *
 * Every cell here is a tap that puts its day on the screen below, so the seven
 * days of a rendered page are exactly the set Today can be asked for next.
 * Warming them is what makes picking one instant instead of a placeholder and
 * then an answer — a swap the reader sees even when it is honest. It is two
 * requests for the whole page, not two per day; see `usePrefetchDays`.
 *
 * Clamped at today, because a day that has not happened cannot be picked: the
 * cells ahead of it are disabled, and seeding them would be claiming to know
 * something about a day nobody has had yet.
 */
function Week({ start, width, selected, today, onSelect }: WeekProps) {
  const { t } = useTranslation('logging')
  const days = useMemo(() => weekDays(start), [start])
  const { data: marks, isSuccess } = useDayMarks(start, days[6])
  const { data: settings } = useSettings()

  const reachable = days[6] > today ? today : days[6]
  usePrefetchDays(start, reachable)
  usePrefetchActivityDays(start, reachable)

  const extendsBudget = settings?.activity_extends_budget !== false

  /**
   * The settings row counts toward readiness, not just the marks.
   *
   * `extendsBudget` defaults to true while that query is out, and it is the
   * term that decides whether a day with movement on it reads as under or
   * over. On an account that has the setting turned OFF, every such day drew
   * green and then went amber a moment later — the strip changing its verdict
   * on days the user had already read.
   */
  const ready = isSuccess && settings !== undefined

  const cells: DateStripDay[] = days.map((date) => {
    const at = parseISO(date)
    const mark = markFor(date, marks?.[date], today, ready, extendsBudget)

    return {
      key: date,
      // The narrow weekday name: one letter, so two of them are "T" and two
      // are "S". That is why a cell is keyed by its date and not its label.
      initial: format(at, 'EEEEE'),
      day: at.getDate(),
      mark,
      disabled: date > today,
      accessibilityLabel: t(`week.a11y.${mark ?? (date > today ? 'ahead' : 'plain')}`, {
        day: format(at, 'EEEE d MMMM'),
      }),
    }
  })

  return (
    <View style={{ width }}>
      <DateStrip days={cells} value={selected} onChange={onSelect} />
    </View>
  )
}

/**
 * The week strip at the top of Today: seven days, and earlier weeks behind them.
 *
 * A pager rather than a scrolling rail of days. A rail would let a week be left
 * half on screen, and the dots are read as a set — "four green and a hollow
 * one" is the sentence this is here to say, and it only parses when the seven
 * days that make it up are the seven days visible.
 *
 * It measures itself rather than working the width out from the window: the
 * screen's gutter is the shell's business, and a page has to be exactly as wide
 * as the row it snaps to or every swipe drifts.
 */
export function WeekPicker({ className }: { className?: string }) {
  const { selectedDate, setSelectedDate, todayKey } = useSelectedDate()
  const [width, setWidth] = useState(0)
  const list = useRef<FlatList<string>>(null)

  const weeks = useMemo(() => weekStarts(todayKey), [todayKey])

  return (
    <View className={className} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <FlatList
          ref={list}
          data={weeks}
          keyExtractor={(start) => start}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          // A horizontal list still reports a vertical indicator to the
          // accessibility tree, which turns up as a "2 pages" scroll bar
          // sitting on top of Saturday.
          showsVerticalScrollIndicator={false}
          // Opens on the current week. Every page is exactly one list wide, so
          // the offset is arithmetic and the list never has to measure to find
          // it — which is what `initialScrollIndex` needs to land first try.
          initialScrollIndex={weeks.length - 1}
          getItemLayout={(_data, index) => ({ length: width, offset: width * index, index })}
          onScrollToIndexFailed={({ index }) =>
            list.current?.scrollToOffset({ offset: width * index, animated: false })
          }
          initialNumToRender={1}
          windowSize={3}
          renderItem={({ item }) => (
            <Week
              start={item}
              width={width}
              selected={selectedDate}
              today={todayKey}
              onSelect={setSelectedDate}
            />
          )}
        />
      ) : null}
    </View>
  )
}
