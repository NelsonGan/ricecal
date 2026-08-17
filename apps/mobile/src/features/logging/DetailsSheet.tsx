import { parseISO, subDays } from 'date-fns'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { dateKey, datesBetween } from '@/data/client'
import { useThemeColors } from '@/theme/useTheme'
import {
  Button,
  cn,
  Divider,
  Icon,
  IconButton,
  Sheet,
  Tappable,
  Text,
  TextField,
  Wheel,
  type WheelOption,
} from '@/ui'
import { type Clock, clockLabel, DAYS_BACK, dayLabel } from './when'

/** The two halves of a twelve-hour day, in the order a clock reads them. */
const PERIODS = ['am', 'pm'] as const

/** What the sheet hands back: everything about the entry that is not a number. */
export type EntryDetails = { name: string; date: string; clock: Clock }

export type DetailsSheetProps = {
  visible: boolean
  onClose: () => void
  /** What is staged on the screen behind, which is what this opens on. */
  details: EntryDetails
  /** What the name falls back to when the field is emptied: the row's own. */
  namePlaceholder: string
  /** Today, so nothing ahead of it can be offered. Passed in: this stays presentational. */
  today: string
  /** Writes them. Throws to leave the sheet open with the draft still in it. */
  onSave: (next: EntryDetails) => Promise<void>
  /** Said when the write failed. The sheet stays where it is. */
  onError: () => void
}

/**
 * WHAT THIS ENTRY IS AND WHEN IT WAS EATEN: the two things about a logged meal
 * that are not figures.
 *
 * One sheet rather than two affordances, and that is the point. The name used to
 * be retyped in the app bar where it sat and the day and time had a card of their
 * own with an edit control of their own — so an entry's identity was edited in two
 * places, neither of which looked like the other, and one of them was a heading
 * that turned into a caret.
 *
 * TWO PANELS, A PATH RATHER THAN TABS. The name and the when read as one short
 * form; tapping the when opens the picker over it, the way `IngredientSheet`
 * leads from a search to an amount. The when used to be laid out flat underneath
 * the name — a week strip that paged, an hour field, a minute field and an am/pm
 * control, five controls to say one thing — and typing digits into boxes is not
 * what anybody means by picking a time.
 *
 * IT SAVES ITSELF. The screen had one Save button in its footer that wrote every
 * staged section at once, and a sheet whose button said "Done" and wrote nothing
 * was a second staging level nobody asked for. Save writes the name and the when
 * and closes; a failure leaves the draft where it is.
 *
 * Full height because the name field raises a keyboard, and the button is in the
 * BODY rather than a footer: at full height a footer lands behind the keyboard.
 * Both rules are in CLAUDE.md.
 */
export function DetailsSheet({
  visible,
  onClose,
  details,
  namePlaceholder,
  today,
  onSave,
  onError,
}: DetailsSheetProps) {
  const { t } = useTranslation(['logging', 'common'])

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      fullHeight
      /* NOT SCROLLABLE, and here that is load-bearing rather than the tidiness
         CLAUDE.md asks for on a short full-height sheet.
         The picker's wheels are vertical scroll views, and a vertical scroller
         inside another vertical scroller is a fight: the sheet's body took every
         drag that started on a wheel, so the wheels simply did not turn. Both
         panels are short — a field and a row, or a header and the wheels — so
         there was nothing for the outer one to scroll anyway. */
      scrollable={false}
    >
      {/* Mounted only while the sheet is up, which IS the seeding: the draft
          below is `useState`, so a fresh mount reads whatever is staged on the
          screen now — and the panel it opens on is the first one again. The fall
          animation runs before `onClose`, so the form is still here while the
          panel leaves. */}
      {visible ? (
        <DetailsForm
          details={details}
          namePlaceholder={namePlaceholder}
          today={today}
          onSave={onSave}
          onError={onError}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  )
}

function DetailsForm({
  details,
  namePlaceholder,
  today,
  onSave,
  onError,
  onClose,
}: Pick<
  DetailsSheetProps,
  'details' | 'namePlaceholder' | 'today' | 'onSave' | 'onError' | 'onClose'
>) {
  const { t } = useTranslation(['logging', 'common'])
  const colors = useThemeColors()

  const [picking, setPicking] = useState(false)
  const [name, setName] = useState(details.name)
  const [date, setDate] = useState(details.date)
  const [clock, setClock] = useState(details.clock)
  const [saving, setSaving] = useState(false)

  const labels = { today: t('common:date.today'), yesterday: t('common:date.yesterday') }

  const save = async () => {
    setSaving(true)
    try {
      // A name emptied is not a rename: the title falls back to the row's own,
      // which is what the placeholder was saying all along.
      await onSave({ name: name.trim() || namePlaceholder, date, clock })
    } catch {
      onError()
      setSaving(false)
      return
    }
    onClose()
  }

  if (picking) {
    return (
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <IconButton
            size="sm"
            accessibilityLabel={t('common:action.back')}
            onPress={() => setPicking(false)}
          >
            {/* Tinted, like every chevron in this app's chrome: the illustration
                carries its own colour and reads as a stray accent beside a title. */}
            <Icon set="ui" name="chevron-left" size={20} tintColor={colors.muted} />
          </IconButton>
          {/* The value being picked, spelled out. The wheels below say it in
              parts; this is the sentence they add up to, and it is the one thing
              on the panel that confirms a flick landed where it looked like it
              landed. */}
          <Text variant="subtitle" className="flex-1" numberOfLines={1}>
            {t('logging:detail.whenValue', {
              day: dayLabel(date, today, labels),
              time: clockLabel(clock),
            })}
          </Text>
        </View>

        <WhenWheels
          anchor={details.date}
          date={date}
          clock={clock}
          today={today}
          onDate={setDate}
          onClock={setClock}
        />

        <Button fullWidth loading={saving} onPress={() => void save()}>
          {t('logging:detail.save')}
        </Button>
      </View>
    )
  }

  return (
    <View className="gap-3">
      <TextField
        label={t('logging:detail.nameField')}
        value={name}
        onChangeText={setName}
        // What the title falls back to when the field is emptied, so the empty
        // state of the field says what the empty state of the name will be
        // rather than going blank.
        placeholder={namePlaceholder}
        maxLength={120}
        returnKeyType="done"
      />

      {/* The when as a VALUE with a way in, not as controls. A row that reads
          "Yesterday at 10:06 am" and opens a picker is the shape every settings
          screen uses for a date, and it keeps this panel to two lines. */}
      <View className="gap-1.5">
        <Text variant="label">{t('logging:detail.whenRow')}</Text>
        <Tappable
          className="min-h-[60px] flex-row items-center justify-between gap-3 rounded-md border-[3px] border-line bg-surface px-5"
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={t('logging:detail.whenRow')}
        >
          <Text variant="bodyStrong" numberOfLines={1} className="min-w-0 flex-1">
            {t('logging:detail.whenValue', {
              day: dayLabel(date, today, labels),
              time: clockLabel(clock),
            })}
          </Text>
          <Icon set="ui" name="chevron-right" size={18} tintColor={colors.muted} />
        </Tappable>
      </View>

      <Divider />

      {/* In the body, after the field, rather than in the sheet's footer: at full
          height a footer lands behind the keyboard. */}
      <Button fullWidth loading={saving} onPress={() => void save()}>
        {t('logging:detail.save')}
      </Button>
    </View>
  )
}

/**
 * The picker: a day, an hour, a minute and which half of the day, as four wheels.
 *
 * NOTHING AHEAD OF TODAY IS OFFERED, which is stronger than disabling it: a meal
 * cannot have been eaten tomorrow, so tomorrow is not a row. That also means the
 * day wheel needs no notion of a disabled state, and the week strip on Today
 * disables its own forward cells for the same reason.
 *
 * A year back, oldest at the top, so scrolling DOWN moves forward in time — the
 * direction a calendar is read. Every row is a small view and they are all
 * rendered, which is affordable for 366 of them in a panel that opens rarely and
 * is what lets the wheel snap without a windowing list's blank frames.
 */
function WhenWheels({
  anchor,
  date,
  clock,
  today,
  onDate,
  onClock,
}: {
  /** The day the entry is on, fixed for as long as the picker is open. */
  anchor: string
  date: string
  clock: Clock
  today: string
  onDate: (next: string) => void
  onClock: (next: Clock) => void
}) {
  const { t } = useTranslation(['logging', 'common'])

  /**
   * Every day the wheel offers, and it is built from the entry's OWN day rather
   * than from the one currently picked.
   *
   * Both ends have to stretch to reach it. An entry older than the window would
   * have no row to park on, and `Wheel` falls back to its first row — so the
   * picker would show a day a year ago as selected while the sentence above it
   * read the entry's real date, which is the one thing a picker must never do. And
   * a day AFTER today is reachable too, by travelling west: an entry filed on the
   * 18th in Sydney, opened on the 17th in Kuala Lumpur.
   *
   * `anchor`, not `date`, and that is the load-bearing part. Depending on the live
   * selection rebuilt a year of rows on every flick of the wheel — under a scroll
   * view that was still decelerating, which on iOS stops it where it stands. The
   * anchor cannot change while the sheet is open, so the list is built once.
   *
   * The copy is read INSIDE the memo for the same reason: an object literal from
   * above would be a new object on every render.
   */
  const days = useMemo<WheelOption[]>(() => {
    const labels = { today: t('common:date.today'), yesterday: t('common:date.yesterday') }
    const from = dateKey(subDays(parseISO(today), DAYS_BACK))
    return datesBetween(from > anchor ? anchor : from, anchor > today ? anchor : today).map(
      (day) => ({ value: day, label: dayLabel(day, today, labels) }),
    )
  }, [today, anchor, t])

  const hours = useMemo<WheelOption[]>(
    () => Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
    [],
  )
  const minutes = useMemo<WheelOption[]>(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        value: String(i),
        label: String(i).padStart(2, '0'),
      })),
    [],
  )

  return (
    // The day takes three shares of the width and each part of the time one: a
    // day reads "Sun 16 Aug" where an hour reads "8", and four equal columns left
    // the dates truncated beside three columns of whitespace.
    <View className="flex-row gap-1.5">
      <Wheel
        className="flex-[3]"
        options={days}
        value={date}
        onChange={onDate}
        accessibilityLabel={t('logging:detail.dayTitle')}
      />
      <Wheel
        className="flex-1"
        options={hours}
        value={String(clock.hour)}
        onChange={(next) => onClock({ ...clock, hour: Number(next) })}
        accessibilityLabel={t('logging:detail.hour')}
      />
      <Wheel
        className="flex-1"
        options={minutes}
        value={String(clock.minute)}
        onChange={(next) => onClock({ ...clock, minute: Number(next) })}
        accessibilityLabel={t('logging:detail.minute')}
      />
      {/* AM AND PM ARE A TOGGLE, NOT A WHEEL, and that is a fix rather than a
          preference. Two options make a wheel whose whole scrollable range is
          40pt — one snap step — and iOS rounds a drag that short back to where it
          started: the column rendered perfectly and could not be moved off "am".
          Two options is a thing you tap anyway. Vertically centred so the pair
          sits level with the middle of the wheels beside it. */}
      <View className="w-[62px] justify-center gap-1.5">
        {PERIODS.map((option) => {
          const chosen = clock.period === option
          return (
            <Tappable
              key={option}
              className={cn('items-center rounded-md py-2.5', chosen ? 'bg-pandan' : 'bg-track')}
              onPress={() => onClock({ ...clock, period: option })}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              accessibilityLabel={t(`logging:detail.${option}`)}
            >
              <Text
                className={cn('font-display text-[17px]', chosen ? 'text-on-pandan' : 'text-muted')}
              >
                {t(`logging:detail.${option}`)}
              </Text>
            </Tappable>
          )
        })}
      </View>
    </View>
  )
}
