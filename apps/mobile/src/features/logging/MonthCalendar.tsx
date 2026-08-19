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

/**
 * The verdict, as a dot laid ON the day's picture.
 *
 * Under it, the dot cost a row of the cell and the picture had to shrink to pay
 * for it — which is backwards on the one screen whose whole argument is the
 * pictures. Over the corner of the plate it costs nothing and is read in the
 * same glance.
 *
 * `missed` is not here. A day with nothing on it has no picture to put a dot on,
 * and the dashed outline of the cell itself is the marker — see `Cell`.
 */
const dots = {
  under: 'bg-pandan',
  over: 'bg-kaya',
} as const

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
 * can get at any other way. So the cell is almost entirely picture, with the
 * number small above it and the verdict laid over its corner.
 *
 * THREE APPEARANCES, and the difference between the last two is load-bearing:
 *
 * - a day with food on it is a filled tile carrying its plate
 * - a day that has been and gone with nothing on it is a DASHED outline
 * - anything else — today before breakfast, a day still ahead, a day the account
 *   had no budget on — is a bare number and no box at all
 *
 * The third is not the second in a lighter shade. A day nobody has had yet has
 * not been missed, and drawing it like a day that was skipped is the app
 * inventing a failure. `markFor` already draws that line and returns `missed`
 * for the second case alone; this is the same distinction in the cell's outline
 * rather than in a dot under it.
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
   * otherwise flip from a dashed outline to a filled tile a moment later, which
   * is the grid changing its mind about a day the reader has already read.
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

  return (
    <Tappable
      className={cn(
        'h-[66px] flex-1 items-center justify-center gap-0.5 rounded-[14px] px-0.5 py-1',
        logged && 'bg-track',
        // The outline IS the "missed" marker, so it is drawn for that day and
        // for no other.
        // `line` rather than `line-strong`: a month somebody has just started
        // logging is mostly missed days, and at the strong weight thirty dashed
        // boxes read as thirty warnings rather than as an empty calendar.
        !logged && mark === 'missed' && 'border border-line border-dashed',
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
          'font-display text-[11px] leading-[13px]',
          selected ? 'text-pandan-ink' : 'text-faint',
        )}
      >
        {parseISO(date).getDate()}
      </Text>

      {/* THE PLATE'S OWN BOX, exactly its size.
          It was `w-full flex-1`, which is taller than the picture inside it —
          so the dot, pinned to that box's bottom-right, sat a few points below
          the plate and read as a mark that had come loose from it. Anchored to a
          box the size of the picture, the dot lands on the corner it is meant
          to be on.

          Rendered whether or not there is a picture in it: a grid where only
          the logged days reserve the space is a grid of two heights, and the
          numbers stop lining up across a row. */}
      <View style={{ width: PLATE, height: PLATE }} className="items-center justify-center">
        {picture}

        {/* On the plate's bottom-right corner, ringed in the tile's own colour.
            The ring is what keeps it legible on a photograph, where a bare
            pandan dot can land on something green. */}
        {logged && mark && mark !== 'missed' ? (
          <View
            className={cn(
              'absolute right-0 bottom-0 h-[10px] w-[10px] rounded-full border-2 border-track',
              dots[mark],
            )}
          />
        ) : null}
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

      {/* The key, and each swatch is drawn the way the grid draws it rather
          than as three dots of different colours. "Not logged" is a dashed
          square because that is what an empty day looks like up there — as a
          hollow dot it named a mark the cells no longer carry. */}
      <View className="flex-row items-center gap-4">
        <View className="flex-row items-center gap-1.5">
          <View className="h-2 w-2 rounded-full bg-pandan" />
          <Text variant="micro">{t('calendar.legend.under')}</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-2 w-2 rounded-full bg-kaya" />
          <Text variant="micro">{t('calendar.legend.over')}</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-2.5 w-2.5 rounded-[4px] border border-line border-dashed" />
          <Text variant="micro">{t('calendar.legend.missed')}</Text>
        </View>
      </View>
    </View>
  )
}
