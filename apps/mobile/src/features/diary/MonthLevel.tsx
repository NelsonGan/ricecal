import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns'
import { View } from 'react-native'

import { dateKey, today as todayKey, useNutritionRange } from '@/data'
import { MonthGrid } from './MonthGrid'
import { SwipePager } from './SwipePager'
import type { Origin } from './ZoomLayer'

export type MonthLevelProps = {
  /** The month being browsed. */
  cursor: Date
  onCursorChange: (month: Date) => void
  /** The selected day, highlighted where it falls. */
  selected: string
  onPickDay: (key: string, origin: Origin) => void
}

/**
 * The middle level: one month, with the next and previous a swipe away.
 *
 * The swipe is easier to claim than the day's — six points of travel rather than
 * fourteen, and it never gives way vertically — because nothing here scrolls. There
 * is no competing gesture for it to be polite towards, and a month grid that needed
 * a deliberate drag would feel stuck.
 */
export function MonthLevel({ cursor, onCursorChange, selected, onPickDay }: MonthLevelProps) {
  const page = (offset: -1 | 0 | 1) => {
    const month = addMonths(cursor, offset)
    return {
      key: format(month, 'yyyy-MM'),
      node: <MonthPage month={month} selected={selected} onPickDay={onPickDay} />,
    }
  }

  return (
    <SwipePager
      pages={[page(-1), page(0), page(1)]}
      onStep={(step) => onCursorChange(addMonths(cursor, step))}
    />
  )
}

/**
 * One month and the days in it that have something logged.
 *
 * Its own component so each page owns its query: rendering the neighbours is what
 * fetches them, so a swipe arrives on a month whose dots are already there.
 */
function MonthPage({
  month,
  selected,
  onPickDay,
}: {
  month: Date
  selected: string
  onPickDay: (key: string, origin: Origin) => void
}) {
  const { data: rows = [] } = useNutritionRange(
    dateKey(startOfMonth(month)),
    dateKey(endOfMonth(month)),
  )
  const logged = new Set(rows.flatMap((row) => (row.log_date ? [row.log_date] : [])))

  return (
    <View className="px-gutter">
      <MonthGrid
        month={month}
        selected={selected}
        logged={logged}
        today={todayKey()}
        onPick={onPickDay}
      />
    </View>
  )
}
