import { endOfYear, parseISO, startOfYear } from 'date-fns'
import { View } from 'react-native'

import { dateKey, useNutritionRange } from '@/data'
import { YearGrid } from './YearGrid'
import type { Origin } from './ZoomLayer'

export type YearLevelProps = {
  /** The year being browsed, as any day inside it. */
  cursor: Date
  /** The selected day, so its month reads as the current one. */
  selected: string
  onPickMonth: (monthIndex: number, origin: Origin) => void
}

/**
 * The outermost level. One query for the whole year — 365 rows at most, and only
 * the dates are read.
 *
 * No swipe between years. The grid fills the screen, so a horizontal drag has
 * nowhere to start that is not on top of a month, and the two chevrons in the header
 * are both a smaller target to hit and a smaller thing to explain than a gesture
 * that competes with twelve buttons.
 */
export function YearLevel({ cursor, selected, onPickMonth }: YearLevelProps) {
  const { data: rows = [] } = useNutritionRange(
    dateKey(startOfYear(cursor)),
    dateKey(endOfYear(cursor)),
  )
  const logged = new Set(rows.flatMap((row) => (row.log_date ? [row.log_date] : [])))
  const selectedDay = parseISO(selected)

  return (
    <View className="px-gutter">
      <YearGrid
        year={cursor.getFullYear()}
        logged={logged}
        selectedMonth={
          selectedDay.getFullYear() === cursor.getFullYear() ? selectedDay.getMonth() : undefined
        }
        onPick={onPickMonth}
      />
    </View>
  )
}
