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

/** Three across, four down. Twelve months at a readable size on a phone. */
const COLUMNS = 3
/** Space between the tiles, taken off each one's width. */
const GAP = 10
/** The month's name, above its grid. Part of the pivot arithmetic. */
const NAME_ROW = 20

export type YearGridProps = {
  year: number
  /** Keys of days with something logged. */
  logged: ReadonlySet<string>
  /** Which month reads as current, if the selected day is in this year. */
  selectedMonth?: number
  /**
   * A month was chosen, with the centre of its tile in this grid's own
   * coordinates — which is what the zoom pivots on.
   */
  onPick: (monthIndex: number, origin: Origin) => void
}

/**
 * A year, as twelve miniature months.
 *
 * Each tile is a real month grid at a size you read rather than use: the point is
 * the shape of the year — which weeks have dots and which do not — and picking one
 * to zoom into. Days are not tappable here. At this size the target would be four
 * points across, and the month view one zoom away is where a day is chosen.
 *
 * Logged days are coloured rather than dotted. A dot under a nine-point numeral is
 * a smudge, and this many nodes on screen is reason enough not to add 365 more.
 */
export function YearGrid({ year, logged, selectedMonth, onPick }: YearGridProps) {
  const [frame, setFrame] = useState({ x: 0, y: 0, width: 0 })
  const { width: windowWidth } = useWindowDimensions()
  // See `MonthGrid`: an unmeasured grid must not be a collapsed one, because this
  // arrives mid-zoom and that frame is on screen.
  const gridWidth = frame.width || windowWidth - spacing.gutter * 2

  const onLayout = (event: LayoutChangeEvent) => {
    const { x, y, width } = event.nativeEvent.layout
    setFrame((current) =>
      current.x === x && current.y === y && current.width === width ? current : { x, y, width },
    )
  }

  const tileWidth = (gridWidth - GAP * (COLUMNS - 1)) / COLUMNS
  // A month is six rows at most, and every tile is the same height whether it
  // needs six or five — a grid whose tiles jog up and down does not read as a year.
  const tileHeight = NAME_ROW + (tileWidth / 7) * 6

  return (
    <View
      className="flex-row flex-wrap justify-between"
      style={{ rowGap: GAP }}
      onLayout={onLayout}
    >
      {Array.from({ length: 12 }, (_, index) => {
        const month = new Date(year, index, 1)

        return (
          <Tappable
            key={format(month, 'yyyy-MM')}
            style={{ width: tileWidth, height: tileHeight }}
            onPress={() =>
              onPick(index, {
                x: frame.x + (index % COLUMNS) * (tileWidth + GAP) + tileWidth / 2,
                y: frame.y + Math.floor(index / COLUMNS) * (tileHeight + GAP) + tileHeight / 2,
              })
            }
            accessibilityRole="button"
            accessibilityLabel={format(month, 'MMMM yyyy')}
          >
            <Text
              variant="label"
              className={cn(
                'pb-1 text-[13px] leading-[16px]',
                index === selectedMonth ? 'text-pandan-ink' : 'text-ink',
              )}
            >
              {format(month, 'MMM')}
            </Text>
            <MiniMonth month={month} logged={logged} width={tileWidth} />
          </Tappable>
        )
      })}
    </View>
  )
}

/** One month's days, small, with the logged ones picked out. */
function MiniMonth({
  month,
  logged,
  width,
}: {
  month: Date
  logged: ReadonlySet<string>
  width: number
}) {
  const first = startOfMonth(month)
  const days = eachDayOfInterval({
    start: startOfWeek(first, { weekStartsOn: 1 }),
    end: addDays(startOfWeek(endOfMonth(month), { weekStartsOn: 1 }), 6),
  })

  const cell = width / 7

  return (
    <View className="flex-row flex-wrap">
      {days.map((day) => {
        const key = dateKey(day)
        const outside = !isSameMonth(day, first)

        return (
          <View
            key={key}
            style={{ width: cell, height: cell }}
            className="items-center justify-center"
          >
            <Text
              className={cn(
                'font-body-bold text-[9px] leading-[11px]',
                outside ? 'text-transparent' : logged.has(key) ? 'text-pandan-ink' : 'text-muted',
              )}
            >
              {day.getDate()}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
