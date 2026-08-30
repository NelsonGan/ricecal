import { format, isToday, parseISO } from 'date-fns'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useDeleteWeighIn, useLogWeight, useWeighIns } from '@/data'
import { datePattern } from '@/lib/dates'
import { fromKg, showWeight, toKg, UNIT_KEY, type WeightUnit } from '@/lib/units'
import { Button, ConfirmSheet, Icon, SegmentedControl, Sheet, Stepper, Text, useToast } from '@/ui'

export type WeighInSheetProps = {
  /** The day being recorded or corrected. Null while the sheet is shut. */
  date: string | null
  onClose: () => void
  unit: WeightUnit
  /** Writes `user_settings.units`, which is the same preference Settings shows. */
  onUnitChange: (unit: WeightUnit) => void
}

/** What the ± buttons move by, in whichever unit is on screen. */
const STEP = 0.1
/** Bounds in kilograms, converted for display. Wide enough not to be a judgement. */
const MIN_KG = 25
const MAX_KG = 300

/**
 * Adding a weigh-in.
 *
 * A sheet, not a page: recording a number you already know should not cost a
 * navigation. The same sheet corrects a past day, because `useLogWeight` upserts
 * on `(user_id, measured_on)` and the day it writes to is the only difference.
 *
 * The draft is held in display units rather than kilograms, because stepping by
 * 0.1 has to move the number on screen by 0.1. Kept in kilograms and converted on
 * render it steps by 0.22 lb, which no round figure lands on.
 */
export function WeighInSheet({ date, onClose, unit, onUnitChange }: WeighInSheetProps) {
  const { t } = useTranslation(['progress', 'common'])
  const toast = useToast()
  const { data: weighIns = [] } = useWeighIns()
  const logWeight = useLogWeight()
  const deleteWeighIn = useDeleteWeighIn()

  const [draft, setDraft] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const existing = date ? weighIns.find((entry) => entry.date === date) : undefined
  /** The newest reading BEFORE this day, which is what the sheet compares against. */
  const previous = date ? [...weighIns].reverse().find((entry) => entry.date < date) : undefined

  /**
   * Both adjustments below happen DURING render rather than in an effect.
   *
   * That is the supported pattern for state that has to follow a prop, and it is
   * the right one here for a reason beyond lint: an effect runs after the first
   * paint, so the sheet would show one frame of the old number as it rises. This
   * re-renders before anything is committed to the screen.
   */
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const [shownUnit, setShownUnit] = useState<WeightUnit>(unit)

  // Seeded when the sheet opens rather than at mount: the query may not have
  // answered on the first render, and a stepper that starts at 0 and jumps once
  // the data lands is one somebody has already started dragging. Keyed on the
  // DAY alone, so a background refetch of the readings cannot discard what is
  // half-typed.
  if (date !== null && seededFor !== date) {
    setSeededFor(date)
    setDraft(Number(fromKg(existing?.kg ?? weighIns.at(-1)?.kg ?? 70, unit).toFixed(1)))
  }

  // Forgotten on the way out, so the next open re-seeds even if it is the same
  // day. This component never unmounts — it is rendered by the screen with a
  // null `date` while shut — so without it, dragging to 99.9 and dismissing
  // leaves 99.9 in the stepper the next time the sheet comes up, over a reading
  // that was never saved.
  if (date === null && seededFor !== null) {
    setSeededFor(null)
  }

  // Switching kg/lb converts what is already there instead of starting over.
  // Through kilograms both ways, so the round trip is the identity rather than
  // two independent roundings.
  if (shownUnit !== unit) {
    setShownUnit(unit)
    setDraft(Number(fromKg(toKg(draft, shownUnit), unit).toFixed(1)))
  }

  const draftKg = toKg(draft, unit)
  const delta = previous ? draftKg - previous.kg : null

  const save = () => {
    if (!date) return
    logWeight.mutate({ kg: Number(draftKg.toFixed(1)), date })
    onClose()
    toast.show({ title: t('progress:weight.saved'), tone: 'success' })
  }

  const remove = () => {
    if (date) deleteWeighIn.mutate({ date })
    setConfirmDelete(false)
    onClose()
  }

  return (
    <>
      {/* Stood down while the confirmation is up rather than left underneath it.
          `Sheet` is a native `Modal`, so two visible at once is two windows and
          the order they present in is the platform's business. `date` is
          untouched, so cancelling brings this straight back. */}
      <Sheet
        closeLabel={t('common:action.close')}
        visible={date !== null && !confirmDelete}
        onClose={onClose}
        title={
          date && !isToday(parseISO(date))
            ? t('progress:weight.sheetEditTitle', {
                date: format(parseISO(date), datePattern('dayMonthLong')),
              })
            : t('progress:weight.sheetTitle')
        }
        // Only for today. "This morning" under a heading that says "Weigh in on
        // 24 July" describes a different day from the one being edited.
        description={
          date && !isToday(parseISO(date)) ? undefined : t('progress:weight.thisMorning')
        }
        footer={
          <View className="gap-2">
            <Button fullWidth onPress={save}>
              {t('progress:weight.save')}
            </Button>
            {/* Only for a day that already has a reading. There is nothing to
                remove from a day the Add button just opened. */}
            {existing ? (
              <Button
                variant="ghost"
                fullWidth
                labelClassName="text-hibiscus-ink"
                onPress={() => setConfirmDelete(true)}
              >
                {t('progress:weight.remove')}
              </Button>
            ) : null}
          </View>
        }
      >
        <View className="gap-md rounded-md bg-canvas p-3">
          <Stepper
            value={draft}
            onChange={setDraft}
            step={STEP}
            min={Number(fromKg(MIN_KG, unit).toFixed(1))}
            max={Number(fromKg(MAX_KG, unit).toFixed(1))}
            unit={t(UNIT_KEY[unit])}
            format={(value) => value.toFixed(1)}
            // Typed as well as stepped: 0.1 at a time from 70.0 to 82.4 is a
            // hundred and twenty taps.
            editable
            editLabel={t('progress:weight.sheetTitle')}
            accessibilityLabel={t('progress:weight.sheetTitle')}
            decrementLabel={t('common:a11y.decrease')}
            incrementLabel={t('common:a11y.increase')}
          />
        </View>

        <SegmentedControl
          options={[
            { value: 'kg' as const, label: t('common:unit.kg') },
            { value: 'lb' as const, label: t('common:unit.lb') },
          ]}
          value={unit}
          onChange={onUnitChange}
          accessibilityLabel={t('common:unit.kg')}
        />

        {delta === null ? null : (
          <View className="flex-row items-center gap-2.5 rounded-md bg-pandan-soft px-3.5 py-3">
            <Icon set="body" name={delta > 0 ? 'trend-up' : 'trend-down'} size={20} />
            <Text variant="label" className="min-w-0 flex-1 text-pandan-ink">
              {Math.abs(delta) < 0.05
                ? t('progress:weight.same', { day: dayName(previous?.date) })
                : t(delta > 0 ? 'progress:weight.up' : 'progress:weight.down', {
                    value: showWeight(Math.abs(delta), unit),
                    unit: t(UNIT_KEY[unit]),
                    day: dayName(previous?.date),
                  })}
            </Text>
          </View>
        )}
      </Sheet>

      <ConfirmSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={t('progress:weight.removeTitle')}
        description={t('progress:weight.removeBody')}
        confirmLabel={t('common:action.delete')}
        cancelLabel={t('common:action.keep')}
        tone="danger"
      />
    </>
  )
}

/** "Friday" for a day inside the last week, "24 July" for anything older. */
function dayName(date: string | undefined) {
  if (!date) return ''
  const parsed = parseISO(date)
  const daysAgo = (Date.now() - parsed.getTime()) / 86_400_000
  return daysAgo < 7 ? format(parsed, 'EEEE') : format(parsed, datePattern('dayMonthLong'))
}
