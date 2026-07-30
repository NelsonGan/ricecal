import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { useState } from 'react'
import { type LayoutChangeEvent, useWindowDimensions, View } from 'react-native'

import { dateKey } from '@/data'
import { spacing } from '@/theme/tokens'
import { cn, Tappable, Text } from '@/ui'
import type { Origin } from './ZoomLayer'

/** Height of the M T W T F S S row, which the pivot arithmetic has to account for. */
const WEEKDAY_ROW = 24
/** A cell is a little taller than it is wide, so six rows still look like a month. */
const CELL_RATIO = 1.08

export type MonthGridProps = {
  /** Any day inside the month to draw. */
  month: Date
  /** The selected day, highlighted when it falls in this month. */
  selected: string
  /** Keys of days with something logged. */
  logged: ReadonlySet<string>
  /** Today, passed in so the grid does not read the clock during a render. */
  today: string
  /**
   * A day was chosen, with the centre of its cell in this grid's own coordinates —
   * which is what the zoom pivots on.
   */
  onPick: (key: string, origin: Origin) => void
}

/**
 * One month, as a grid of days.
 *
 * Weeks start on Monday, matching every other date in the app. The leading and
 * trailing days of the neighbouring months are drawn faintly rather than left
 * blank: a grid that starts mid-row reads as broken, and those days are real days
 * a user might want.
 *
 * The cell size comes from one `onLayout` rather than from the window, so the grid
 * is correct inside a card, on a tablet and after a rotation — and knowing it is
 * also what lets a tap report where it happened without measuring anything.
 */
export function MonthGrid({ month, selected, logged, today, onPick }: MonthGridProps) {
  // Where this grid sits inside its parent, and how wide it is. Both feed the
  // pivot: the parent is the zoom layer, so a cell's centre in grid coordinates
  // plus this offset is a cell's centre in layer coordinates.
  const [frame, setFrame] = useState({ x: 0, y: 0, width: 0 })
  const { width: windowWidth } = useWindowDimensions()
  /**
   * The window less the gutter until the real measurement lands.
   *
   * Not zero, which is what an unmeasured grid would otherwise be: seven cells of
   * no width collapse the whole month onto one row, and this grid arrives DURING a
   * zoom, so that frame is on screen and moving. The estimate is right to the point
   * on a phone and corrected on the next frame anywhere else.
   */
  const gridWidth = frame.width || windowWidth - spacing.gutter * 2

  const first = startOfMonth(month)
  const gridStart = startOfWeek(first, { weekStartsOn: 1 })
  // Whole weeks, always: the last row is filled out with the next month's first
  // days rather than left ragged.
  const gridEnd = addDays(startOfWeek(endOfMonth(month), { weekStartsOn: 1 }), 6)
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const cell = gridWidth / 7
  const cellHeight = cell * CELL_RATIO

  const onLayout = (event: LayoutChangeEvent) => {
    const { x, y, width } = event.nativeEvent.layout
    setFrame((current) =>
      current.x === x && current.y === y && current.width === width ? current : { x, y, width },
    )
  }

  return (
    <View onLayout={onLayout}>
      <View className="flex-row" style={{ height: WEEKDAY_ROW }}>
        {days.slice(0, 7).map((day) => (
          <Text
            key={`weekday-${day.getDay()}`}
            variant="micro"
            className="text-center"
            style={{ width: cell }}
          >
            {format(day, 'EEEEE')}
          </Text>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {days.map((day, index) => {
          const key = dateKey(day)
          const outside = !isSameMonth(day, first)
          const isSelected = key === selected
          const isToday = key === today

          return (
            <Tappable
              key={key}
              style={{ width: cell, height: cellHeight }}
              className="items-center justify-center"
              onPress={() =>
                onPick(key, {
                  // The centre of this cell, in the layer's coordinates. Derived
                  // from the index rather than measured: seven per row, and the
                  // row height is known.
                  x: frame.x + ((index % 7) + 0.5) * cell,
                  y: frame.y + WEEKDAY_ROW + (Math.floor(index / 7) + 0.5) * cellHeight,
                })
              }
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={format(day, 'EEEE d MMMM')}
            >
              <View
                className={cn(
                  'items-center justify-center rounded-full',
                  isSelected && 'bg-pandan',
                  !isSelected && isToday && 'border-2 border-pandan',
                )}
                style={{ width: cell - 8, height: cell - 8 }}
              >
                <Text
                  className={cn(
                    'font-display text-[17px] leading-[20px]',
                    isSelected ? 'text-on-pandan' : outside ? 'text-faint' : 'text-ink',
                  )}
                >
                  {day.getDate()}
                </Text>
              </View>

              {/* Under the number rather than behind it: a day can be selected,
                  today, and logged all at once, and a fill cannot say three things. */}
              <View
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  logged.has(key) ? 'bg-pandan' : 'bg-transparent',
                  outside && 'opacity-40',
                )}
              />
            </Tappable>
          )
        })}
      </View>
    </View>
  )
}
