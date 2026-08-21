import { format, parseISO } from 'date-fns'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import type { DayPlate } from '@/data'
import { storedImageSource, useDayMarks, useDayPlates, useMealPhotoUrl, useSettings } from '@/data'
import { datePattern } from '@/lib/dates'
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

/**
 * THE VERDICT IS THE CELL'S OUTLINE, in each of its three states, on both
 * backgrounds.
 *
 * `missed` keeps the dashed line it already had, which is now one member of this
 * set rather than a special case: a day with nothing on it is the one outline
 * that is not a colour, because absence is not a result.
 */
const outlines: Record<DateStripMark, { on: string; off: string }> = {
  under: { on: 'border-pandan', off: 'border-pandan' },
  over: { on: 'border-kaya', off: 'border-kaya' },
  missed: { on: 'border-line-strong border-dashed', off: 'border-line border-dashed' },
}

/**
 * THE SELECTED CELL IS FILLED IN ITS OWN VERDICT'S COLOUR.
 *
 * It was `bg-pandan` for every selected day, which is the fill the week strip
 * uses and was right while the outline was the only thing carrying the verdict.
 * It stopped being right the moment both were on the same cell: an over-goal day
 * that happened to be selected drew a kaya ring around a green square, so
 * picking a day changed what the grid appeared to say about it, and the one cell
 * the reader is looking at was the one cell whose colour did not mean anything.
 *
 * The ink is paired with the fill here rather than assumed, because `kaya-ink`
 * is the same value as `kaya` in the dark palette — the trap the water figure
 * fell into. `on-kaya` and `on-pandan` are the two that hold in all four
 * combinations of theme and verdict.
 */
const selections: Record<DateStripMark, { fill: string; ink: string }> = {
  under: { fill: 'bg-pandan', ink: 'text-on-pandan' },
  over: { fill: 'bg-kaya', ink: 'text-on-kaya' },
  missed: { fill: 'bg-line', ink: 'text-ink' },
}

/**
 * And the selection on a day with no verdict: today before breakfast, or a day
 * the account had no budget on. Pandan, which is what selection has always
 * looked like in this app and is not a claim about the day.
 */
const PLAIN_SELECTION = { fill: 'bg-pandan', ink: 'text-on-pandan' } as const

/**
 * Every cell reserves the border's width, drawn or not.
 *
 * React Native lays a border out INSIDE the box, so a cell that has one is
 * smaller inside than a cell that does not — and a month where only some days
 * are outlined would have two picture sizes and two number positions. A
 * transparent border on the rest keeps every cell the same box.
 */
const BORDER = 'border-2 border-transparent'

/** The picture's own box. Nearly the full width of a cell on a 6.1in phone. */
const PLATE = 42

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
 * One day of the month: its number, the biggest thing eaten on it, and how the
 * day went.
 *
 * The picture is the whole reason this view exists — a month of dots is
 * `day_marks` in a different shape, while a month of plates is a thing nobody
 * can get at any other way. So the cell is almost entirely picture: the number
 * above it, and the verdict in the outline around both.
 *
 * SELECTION IS THE FILL, not the outline, and that separation is what makes the
 * outline usable for the verdict at all. They collided while the selected day
 * was drawn with a pandan border, which is also what an under-goal day looks
 * like — one cell claiming two different things with one mark. The selected day
 * is filled and its number takes the ink that reads on that fill.
 *
 * WHICH fill is the verdict's own — see `selections`. A cell says one thing in
 * two ways rather than two things in two ways, and selecting a day no longer
 * changes what the grid appears to say about it.
 *
 * A day that has been and gone with nothing on it is the dashed outline; today
 * before breakfast, a day still ahead and a day the account had no budget on
 * have NO outline at all. That last distinction is load-bearing: a day nobody
 * has had yet has not been missed, and drawing it like a day that was skipped is
 * the app inventing a failure.
 */
function Cell({ date, plate, mark, selected, ahead, onSelect, label }: CellProps) {
  // Called unconditionally, on `undefined` for a day with no photograph, which
  // is what the hook takes: a cell is a component so that the rule about hooks
  // holds for the empty ones as well as for the full ones.
  const { data: photoUrl, isLoading: resolving } = useMealPhotoUrl(plate?.photoPath)
  const photo = storedImageSource(plate?.photoPath, photoUrl)

  if (!date) return <View className="h-[66px] flex-1" />

  /**
   * A day the diary has something to say about.
   *
   * The mark counts as well as the plate, because the two queries land
   * separately: a day whose verdict has arrived and whose picture has not would
   * otherwise flip from a bare cell to a filled tile a moment later, which is
   * the grid changing its mind about a day the reader has already read.
   */
  const logged = Boolean(plate) || mark === 'under' || mark === 'over'

  const picture = photo ? (
    <View className="h-full w-full overflow-hidden rounded-[11px]">
      <MealPhoto source={photo} />
    </View>
  ) : resolving && plate?.photoPath ? (
    <Skeleton width="100%" height={PLATE} rounded={false} className="rounded-[11px] bg-line" />
  ) : plate ? (
    <Icon {...(plate.icon ?? PLACEHOLDER_ICON)} size={PLATE} />
  ) : null

  /* A SOLID fill, which is what selection looks like everywhere else in this app
     — the week strip's selected day is the same. It was `bg-pandan-soft`, which
     is two greys away from the `bg-track` a logged day already has: picking one
     changed almost nothing on screen, and on a month where most days are logged
     the selection was invisible. */
  const selection = selected ? (mark ? selections[mark] : PLAIN_SELECTION) : null

  return (
    <Tappable
      className={cn(
        'h-[66px] flex-1 items-center justify-center gap-0.5 rounded-[14px] px-0.5 py-1',
        BORDER,
        logged && 'bg-track',
        selection?.fill,
        mark && outlines[mark][selected ? 'on' : 'off'],
        ahead && 'opacity-40',
      )}
      onPress={ahead ? undefined : () => onSelect(date)}
      disabled={ahead}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: ahead }}
      accessibilityLabel={label}
    >
      <Text
        className={cn('font-display text-[11px] leading-[13px]', selection?.ink ?? 'text-faint')}
      >
        {parseISO(date).getDate()}
      </Text>

      {/* The plate's own box, rendered whether or not there is a picture in it:
          a grid where only the logged days reserve the space is a grid of two
          heights, and the numbers stop lining up across a row. */}
      <View style={{ width: PLATE, height: PLATE }} className="items-center justify-center">
        {picture}
      </View>
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
        <Text variant="subtitle">{format(parseISO(month), datePattern('monthYear'))}</Text>
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
                          day: format(at, datePattern('weekdayDayMonthLong')),
                        })
                      : undefined
                  }
                />
              )
            })}
          </View>
        ))}
      </View>

      {/* The key, and each swatch IS a cell in miniature: an outlined square in
          the colour the grid uses, not a dot in it. A legend that speaks a
          different language from the thing it explains has to be translated
          before it can be read. */}
      <View className="flex-row items-center gap-4">
        {(['under', 'over', 'missed'] as const).map((kind) => (
          <View key={kind} className="flex-row items-center gap-1.5">
            <View className={cn('h-3 w-3 rounded-[3px] border-2', outlines[kind].off)} />
            <Text variant="micro">{t(`calendar.legend.${kind}`)}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
