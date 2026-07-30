import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { View } from 'react-native'

import { dateKey, type Entry, useNutritionRange, usePrefetchDays, useSelectedDate } from '@/data'
import { DateStrip, type DateStripDay } from '@/ui'
import { DayPanel } from './DayPanel'
import { SwipePager } from './SwipePager'

/** Room under the last card for the floating Today button to sit over. */
const TODAY_BUTTON_CLEARANCE = 64

export type DayLevelProps = {
  onPressEntry: (entry: Entry) => void
  onFixEntry: (entry: Entry) => void
}

/**
 * The innermost level: a week across the top, and the day itself under it.
 *
 * The strip does not move with the swipe. It is where you are rather than what you
 * are reading, so it stays put and re-marks itself as the day changes — the same
 * relationship a tab bar has to a screen. It also always shows the week the selected
 * day belongs to, so paging from Sunday to Monday scrolls the row exactly once
 * rather than drifting a day at a time.
 *
 * Two days either side are fetched without being drawn. The pager already mounts
 * one, which covers a swipe; the pair beyond it covers the second swipe of someone
 * who is looking for a day rather than reading one, and that is the case where a
 * page arrived before its data and briefly looked like an empty day.
 */
export function DayLevel({ onPressEntry, onFixEntry }: DayLevelProps) {
  const { selectedDate, setSelectedDate } = useSelectedDate()
  const selected = parseISO(selectedDate)

  const monday = startOfWeek(selected, { weekStartsOn: 1 })
  const { data: week } = useNutritionRange(dateKey(monday), dateKey(addDays(monday, 6)))
  const logged = new Set((week ?? []).flatMap((row) => (row.log_date ? [row.log_date] : [])))

  const days: DateStripDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index)
    const key = dateKey(date)
    return { key, initial: format(date, 'EEEEE'), day: date.getDate(), logged: logged.has(key) }
  })

  usePrefetchDays([dateKey(addDays(selected, -2)), dateKey(addDays(selected, 2))])

  const page = (offset: -1 | 0 | 1) => {
    const key = dateKey(addDays(selected, offset))
    return {
      key,
      node: (
        <DayPanel
          date={key}
          onPressEntry={onPressEntry}
          onFixEntry={onFixEntry}
          bottomClearance={TODAY_BUTTON_CLEARANCE}
        />
      ),
    }
  }

  return (
    <View className="flex-1">
      <View className="px-gutter pb-stack">
        <DateStrip days={days} value={selectedDate} onChange={setSelectedDate} />
      </View>

      <SwipePager
        pages={[page(-1), page(0), page(1)]}
        onStep={(step) => setSelectedDate(dateKey(addDays(selected, step)))}
        scrollablePages
      />
    </View>
  )
}
