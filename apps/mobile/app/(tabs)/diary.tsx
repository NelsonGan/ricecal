import { addMonths, addYears, format, isSameDay, parseISO } from 'date-fns'
import { useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Entry, today as todayKey, useSelectedDate } from '@/data'
import {
  CalendarHeader,
  CENTRE_ORIGIN,
  DayLevel,
  MonthLevel,
  type Origin,
  TodayButton,
  YearLevel,
  ZoomLayer,
} from '@/features/diary'
import { Screen } from '@/ui'

/** The three levels, outermost last. */
type Level = 'day' | 'month' | 'year'

/**
 * L7 DIARY, at three zoom levels.
 *
 * A day, the month it belongs to, and the year — the same three Apple's calendar
 * has, and for the same reason: a diary is read one day at a time and navigated one
 * month at a time, and neither of those is the same job. Days and months swipe
 * sideways because consecutive ones are what you want next; the levels are reached
 * by zooming out, because they are where you are rather than somewhere else.
 *
 * How the zoom is built is in `ZoomLayer`, and the short version is that both levels
 * animate in the same direction at once, pivoted on the cell that was tapped, so it
 * reads as travel rather than as a crossfade. What this screen owns is the state
 * machine: which level is showing, which level is on its way out, and where the
 * zoom is anchored.
 *
 * `cursor` is separate from the selected day on purpose. Paging through months to
 * see what August looked like must not move which day the diary is showing — only
 * tapping a date does that, which is also the tap that zooms back in.
 */
export default function DiaryScreen() {
  const { t } = useTranslation(['logging', 'common'])
  const router = useRouter()
  const { selectedDate, setSelectedDate } = useSelectedDate()

  const [level, setLevel] = useState<Level>('day')
  /** The month and year being browsed. Follows the selected day on the way out. */
  const [cursor, setCursor] = useState(() => parseISO(selectedDate))
  /** Where the current level's entrance is anchored. */
  const [origin, setOrigin] = useState<Origin>(CENTRE_ORIGIN)
  /** Which way the last zoom went, so both layers travel together. */
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  /** The level on its way out, mounted only for the length of the animation. */
  const [leaving, setLeaving] = useState<Level | null>(null)

  /**
   * The level as of now, for the arriving layer's completion callback to check
   * itself against.
   *
   * A zoom that starts while another is still running unmounts the layer in
   * flight, but its timing callback has already been scheduled and still fires.
   * Left ungated it clears `leaving` for the transition that is now running, and
   * the level being left behind vanishes instead of receding.
   */
  const levelNow = useRef<Level>('day')
  levelNow.current = level

  const zoom = useCallback((next: Level, to: 'in' | 'out', at: Origin) => {
    setDirection(to)
    setOrigin(at)
    setLeaving(levelBefore(next, to))
    setLevel(next)
  }, [])

  const openDay = (key: string, at: Origin) => {
    setSelectedDate(key)
    setCursor(parseISO(key))
    zoom('day', 'in', at)
  }

  const openMonth = (monthIndex: number, at: Origin) => {
    setCursor((current) => new Date(current.getFullYear(), monthIndex, 1))
    zoom('month', 'in', at)
  }

  const goToToday = () => {
    const key = todayKey()
    setSelectedDate(key)
    setCursor(parseISO(key))
    // Straight to the day, from wherever. "Today" means the day, not the month it
    // happens to be in.
    if (level !== 'day') zoom('day', 'in', CENTRE_ORIGIN)
  }

  const onPressEntry = (entry: Entry) =>
    router.push({
      pathname: '/log/food/[id]',
      params: { id: entry.foodId, entryId: entry.id },
    })

  const onFixEntry = (entry: Entry) =>
    router.push({ pathname: '/log/search', params: { meal: entry.meal } })

  const selected = parseISO(selectedDate)
  const onToday = isSameDay(selected, new Date())

  const header =
    level === 'day' ? (
      <CalendarHeader
        parent={format(selected, 'MMMM yyyy')}
        onZoomOut={() => {
          // The month that opens is the one the day belongs to, whatever was being
          // browsed before.
          //
          // Anchored on the middle rather than on that day's cell, which would be
          // the truer pivot: the month has not been laid out at the moment the
          // animation starts, so where its cell for the 12th will end up is not yet
          // known. Zooming OUT from the centre still reads correctly — everything
          // recedes — and it is the direction where the anchor matters least.
          setCursor(selected)
          zoom('month', 'out', CENTRE_ORIGIN)
        }}
        title={format(selected, 'EEE d MMM')}
      />
    ) : level === 'month' ? (
      <CalendarHeader
        parent={format(cursor, 'yyyy')}
        onZoomOut={() => zoom('year', 'out', CENTRE_ORIGIN)}
        title={format(cursor, 'MMMM')}
        onPrevious={() => setCursor((current) => addMonths(current, -1))}
        onNext={() => setCursor((current) => addMonths(current, 1))}
        previousLabel={t('logging:diary.previousMonth')}
        nextLabel={t('logging:diary.nextMonth')}
      />
    ) : (
      <CalendarHeader
        title={format(cursor, 'yyyy')}
        onPrevious={() => setCursor((current) => addYears(current, -1))}
        onNext={() => setCursor((current) => addYears(current, 1))}
        previousLabel={t('logging:diary.previousYear')}
        nextLabel={t('logging:diary.nextYear')}
      />
    )

  const body = (which: Level) => {
    if (which === 'day') {
      return <DayLevel onPressEntry={onPressEntry} onFixEntry={onFixEntry} />
    }
    if (which === 'month') {
      return (
        <MonthLevel
          cursor={cursor}
          onCursorChange={setCursor}
          selected={selectedDate}
          onPickDay={openDay}
        />
      )
    }
    return <YearLevel cursor={cursor} selected={selectedDate} onPickMonth={openMonth} />
  }

  return (
    // No scroll of its own: each level scrolls or does not on its own terms, and a
    // zoom that moved the page under a scroll offset would land somewhere nobody
    // asked for.
    <Screen scroll={false} flush>
      {header}

      <View className="flex-1">
        <ZoomLayer
          // Keyed by level, so arriving at one always mounts a fresh layer and
          // therefore always plays the entrance. Without the key React would reuse
          // the view and the zoom would happen once.
          key={level}
          part="arriving"
          direction={direction}
          origin={origin}
          // `level` here is this layer's own, captured when it was rendered. A
          // callback that fires after the next zoom has begun sees a different one
          // in the ref and leaves that transition alone.
          onFinished={() => {
            if (levelNow.current === level) setLeaving(null)
          }}
        >
          {body(level)}
        </ZoomLayer>

        {leaving ? (
          <ZoomLayer
            key={`leaving-${leaving}`}
            part="leaving"
            direction={direction}
            origin={origin}
          >
            {body(leaving)}
          </ZoomLayer>
        ) : null}

        {/* Outside both layers, so it holds still while the calendar zooms. */}
        {onToday ? null : <TodayButton label={t('logging:diary.today')} onPress={goToToday} />}
      </View>
    </Screen>
  )
}

/** Which level a zoom in the given direction came FROM. */
function levelBefore(next: Level, direction: 'in' | 'out'): Level {
  const order: Level[] = ['day', 'month', 'year']
  const index = order.indexOf(next)
  return order[direction === 'in' ? index + 1 : index - 1] ?? next
}
