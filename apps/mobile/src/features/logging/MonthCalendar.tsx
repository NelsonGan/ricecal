import { format, parseISO } from 'date-fns'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { DayPlate } from '@/data'
import { storedImageSource, useDayMarks, useDayPlates, useMealPhotoUrl, useSettings } from '@/data'
import { useThemeColors } from '@/theme/useTheme'
import type { DateStripMark } from '@/ui'
import { cn, Icon, IconButton, Skeleton, Tappable, Text } from '@/ui'
import { MealPhoto } from '../shared/MealPhoto'
import { monthEnd, monthWeeks, stepMonth, weekdayColumns } from './month'
import { markFor } from './week'

/**
 * What a cell draws when its day was logged but nothing knows what the meal
 * looked like — a quick-add, a barcode with no drawing, a swept photograph.
 *
 * The same stand-in the diary rows use, and for the same reason: a grey square
 * says "this day is missing something", where a plate says "this day had food
 * on it and we have no picture of it". The second is the true sentence.
 */
const PLACEHOLDER_ICON = { set: 'food', name: 'empty-plate' } as const

/** How the dot under a day's picture is drawn, in each of its three states. */
const dots: Record<DateStripMark, string> = {
  under: 'bg-pandan',
  over: 'bg-kaya',
  missed: 'border-[1px] border-faint',
}

type CellProps = {
  date: string | null
  plate?: DayPlate
  mark?: DateStripMark
  selected: boolean
  /** A day that has not happened: dimmed, and not selectable. */
  ahead: boolean
  onSelect: (date: string) => void
  label?: string
}

/**
 * One day of the month: its number, the biggest thing eaten on it, and the dot.
 *
 * The picture is the whole reason this view exists — a month of dots is
 * `day_marks` in a different shape, while a month of plates is a thing nobody
 * can get at any other way. So the cell is mostly picture, with the number
 * small above it and the verdict small below.
 */
function Cell({ date, plate, mark, selected, ahead, onSelect, label }: CellProps) {
  // Called unconditionally, on `undefined` for a day with no photograph, which
  // is what the hook takes: a cell is a component so that the rule about hooks
  // holds for the empty ones as well as for the full ones.
  const { data: photoUrl, isLoading: resolving } = useMealPhotoUrl(plate?.photoPath)
  const photo = storedImageSource(plate?.photoPath, photoUrl)

  if (!date) return <View className="h-[62px] flex-1" />

  const picture = photo ? (
    <View className="h-[30px] w-[30px] overflow-hidden rounded-[9px]">
      <MealPhoto source={photo} />
    </View>
  ) : plate ? (
    resolving && plate.photoPath ? (
      <Skeleton width={30} height={30} rounded={false} className="rounded-[9px] bg-line" />
    ) : (
      <Icon {...(plate.icon ?? PLACEHOLDER_ICON)} size={30} />
    )
  ) : null

  return (
    <Tappable
      className={cn(
        'h-[62px] flex-1 items-center rounded-[14px] py-1.5',
        // A logged day is a filled tile and an empty one is an outline. The two
        // are the same size on purpose: a month where only the logged days had
        // a box would read as a chart of attendance rather than as a calendar.
        //
        // What differs is the ARRANGEMENT. A day with a picture spreads its
        // three parts over the whole cell so the plate is the middle of it; a
        // day without one centres its number and its dot, because spread apart
        // they read as two things with a hole between them.
        plate ? 'justify-between bg-track' : 'justify-center gap-1',
        plate ? '' : 'border border-dashed border-line-strong',
        selected && 'border-[2px] border-solid border-pandan',
        ahead && 'opacity-40',
      )}
      onPress={ahead ? undefined : () => onSelect(date)}
      disabled={ahead}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: ahead }}
      accessibilityLabel={label}
    >
      <Text
        className={cn(
          'font-display text-[11px] leading-[12px]',
          selected ? 'text-pandan-ink' : 'text-faint',
        )}
      >
        {parseISO(date).getDate()}
      </Text>

      {plate ? (
        <View className="h-[30px] w-[30px] items-center justify-center">{picture}</View>
      ) : null}

      <View className={cn('h-[5px] w-[5px] rounded-full', mark ? dots[mark] : 'bg-transparent')} />
    </Tappable>
  )
}

export type MonthCalendarProps = {
  /** First day of the month on screen, `yyyy-MM-dd`. */
  month: string
  onMonthChange: (start: string) => void
  selected: string
  onSelect: (date: string) => void
  today: string
  className?: string
}

/**
 * A month of meals, at a glance.
 *
 * The second way of reading the diary, and it answers a question the day view
 * cannot: not "what did I eat" but "what have I been eating". A row of pictures
 * is the only form of that answer somebody actually reads — a month of totals
 * is a chart, and Trends already draws it.
 *
 * ARROWS RATHER THAN A PAGER, unlike the week strip. A week is swiped through
 * constantly and a month is not: twelve taps reaches a year, where the strip
 * would need fifty-two swipes, and a paging grid a screen tall would fight the
 * vertical scroll of everything under it.
 *
 * The two queries are the month's, not the year's. Paging back fetches the
 * month arrived at and react-query keeps it, so going back and forth over the
 * same three months is three requests in total.
 */
export function MonthCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  today,
  className,
}: MonthCalendarProps) {
  const { t } = useTranslation('logging')
  const colors = useThemeColors()

  const to = monthEnd(month)
  const { data: marks, isSuccess } = useDayMarks(month, to)
  const { data: plates } = useDayPlates(month, to)
  const { data: settings } = useSettings()

  const weeks = useMemo(() => monthWeeks(month), [month])
  const columns = useMemo(() => weekdayColumns((date) => format(date, 'EEEEE')), [])

  const extendsBudget = settings?.activity_extends_budget !== false
  /**
   * The same readiness rule the week strip uses, and for the same reason: a
   * verdict drawn before the settings row lands can change its mind afterwards,
   * and a grid of thirty-one dots changing colour a beat after it appears is
   * the loudest version of that.
   */
  const ready = isSuccess && settings !== undefined

  const previous = stepMonth(month, -1, today)
  const next = stepMonth(month, 1, today)

  return (
    <View className={cn('gap-3', className)}>
      <View className="flex-row items-center justify-between">
        <IconButton
          size="sm"
          onPress={previous ? () => onMonthChange(previous) : undefined}
          disabled={!previous}
          accessibilityLabel={t('calendar.previousMonth')}
        >
          {/* Tinted, like every other chevron in the app: chrome is
              monochrome, and the illustration's own palette reads as a stray
              accent beside a month name. */}
          <Icon set="ui" name="chevron-left" size={18} tintColor={colors.muted} />
        </IconButton>
        <Text variant="subtitle">{format(parseISO(month), 'MMMM yyyy')}</Text>
        <IconButton
          size="sm"
          onPress={next ? () => onMonthChange(next) : undefined}
          disabled={!next}
          accessibilityLabel={t('calendar.nextMonth')}
        >
          <Icon set="ui" name="chevron-right" size={18} tintColor={colors.muted} />
        </IconButton>
      </View>

      <View className="flex-row gap-[5px]">
        {columns.map((column) => (
          <Text key={column.key} variant="micro" className="flex-1 text-center">
            {column.label}
          </Text>
        ))}
      </View>

      {/* The weeks in a box of their own, so the rows sit at the grid's own
          spacing rather than at the gap between the calendar's SECTIONS — the
          header, the weekday row, the grid and the key are further apart than
          two rows of days should ever be.

          A row per week rather than one wrapping grid: a wrapped row of
          `flex-1` cells is one cell per line in React Native, and a row that is
          only partly full would share the width among whatever is in it — which
          is what the trailing nulls from `monthWeeks` are for. */}
      <View className="gap-[5px]">
        {weeks.map((week) => (
          <View key={week.find(Boolean) ?? 'empty'} className="flex-row gap-[5px]">
            {week.map((date, index) => {
              const at = date ? parseISO(date) : null
              const ahead = Boolean(date && date > today)
              const mark = date
                ? markFor(date, marks?.[date], today, ready, extendsBudget)
                : undefined

              return (
                <Cell
                  key={date ?? `blank-${index}`}
                  date={date}
                  plate={date ? plates?.[date] : undefined}
                  mark={mark}
                  selected={date === selected}
                  ahead={ahead}
                  onSelect={onSelect}
                  label={
                    at
                      ? t(`week.a11y.${mark ?? (ahead ? 'ahead' : 'plain')}`, {
                          day: format(at, 'EEEE d MMMM'),
                        })
                      : undefined
                  }
                />
              )
            })}
          </View>
        ))}
      </View>

      {/* The key to the dots, which a month needs and a week does not: seven
          cells are read as a set and thirty-one are read one at a time, so the
          colour has to say what it means without the row around it. */}
      <View className="flex-row items-center gap-4">
        {(['under', 'over', 'missed'] as const).map((kind) => (
          <View key={kind} className="flex-row items-center gap-1.5">
            <View className={cn('h-2 w-2 rounded-full', dots[kind])} />
            <Text variant="micro">{t(`calendar.legend.${kind}`)}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
