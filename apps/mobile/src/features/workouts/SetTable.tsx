import { memo, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, TextInput, View } from 'react-native'

import type { LastSet } from '@/data'
import { fromKg, UNIT_KEY, type WeightUnit } from '@/lib/units'
import { useThemeColors } from '@/theme/useTheme'
import { cn, Icon, type NumpadTools, Tappable, Text, useNumpadField } from '@/ui'
import type { Tracking } from './catalogue'
import { setBadges } from './copy'
import { fieldKey, useFieldOrder } from './fieldOrder'
import {
  type DistanceUnit,
  digitsClock,
  digitsToSeconds,
  distanceField,
  parseDistance,
  parseWeight,
  parseWhole,
  secondsToDigits,
  shortClock,
  trim,
  weightField,
} from './format'
import { fieldsFor, type LiveSet, type SetPatch } from './model'

/**
 * The sets of one exercise: the table the logger is mostly made of.
 *
 *   SET   PREVIOUS     KG     REPS    ✓
 *    W    40 × 10      40     10      ✓
 *    1    60 × 8       62.5   8       ✓ 🏆
 *
 * A row turns green when it is ticked. An empty field shows last time's figure
 * as its placeholder, and ticking an empty row takes that figure: the commonest
 * set in a gym is "the same as last time", and it should cost one tap.
 */

/**
 * What a card and its rows call back with. One object for the whole editor,
 * keyed by exercise and set rather than closed over them, so it never changes
 * and a memoised row skips the render when nothing of its own did.
 */
export type CardHandlers = {
  changeSet: (key: string, setId: string, patch: SetPatch) => void
  toggleSet: (key: string, set: LiveSet, fill: SetPatch | undefined) => void
  setMenu: (key: string, set: LiveSet, number: number) => void
  plates: (key: string, kg: number | null) => void
  addSet: (key: string) => void
  notes: (key: string, notes: string) => void
  menu: (key: string) => void
  rest: (key: string) => void
  open: (exerciseId: string) => void
}

export type SetTableProps = {
  /** The exercise's key in the document, which places its fields in the Next order. */
  exerciseKey: string
  /** Named in the pad's header, since the card may be scrolled under the pad. */
  exerciseName: string
  tracking: Tracking
  sets: readonly LiveSet[]
  /**
   * Last time's sets, by position. `null` empties the column: editing a saved
   * workout, where the newest workout with the exercise in it is this one.
   */
  previous: readonly LastSet[] | undefined | null
  unit: WeightUnit
  distanceUnit: DistanceUnit
  /** Sets that are a personal record as things stand. */
  recordIds: ReadonlySet<string>
  /** Off outside the live logger: the column of ticks is replaced by nothing. */
  checkable: boolean
  /** Whether weight fields offer the plate calculator: a barbell's do. */
  plates: boolean
  handlers: CardHandlers
}

const COL_SET = 'w-[34px]'
const COL_FIELD = 'w-[66px]'
/**
 * A lone field gets the width two would have used: a plank or a game has only
 * a time, and "1:30:00" does not fit where "62.5" does.
 */
const COL_FIELD_WIDE = 'w-[132px]'
const fieldWidth = (count: number) => (count === 1 ? COL_FIELD_WIDE : COL_FIELD)
const COL_CHECK = 'w-[44px]'

export function SetTable({
  exerciseKey,
  exerciseName,
  tracking,
  sets,
  previous,
  unit,
  distanceUnit,
  recordIds,
  checkable,
  plates,
  handlers,
}: SetTableProps) {
  const { t } = useTranslation(['workouts', 'common'])
  const fields = fieldsFor(tracking)
  const weightHeading =
    tracking === 'weighted_reps'
      ? t('workouts:weightColumn.added', { unit: t(UNIT_KEY[unit]) })
      : tracking === 'assisted_reps'
        ? t('workouts:weightColumn.assist', { unit: t(UNIT_KEY[unit]) })
        : t(UNIT_KEY[unit])

  const heading = (field: (typeof fields)[number]) =>
    field === 'weight'
      ? weightHeading
      : field === 'reps'
        ? t('workouts:logger.reps')
        : field === 'duration'
          ? t('workouts:logger.time')
          : tracking === 'weight_distance'
            ? 'm'
            : distanceUnit

  const badges = setBadges(sets, t)

  return (
    <View className="gap-1">
      <View className="flex-row items-center px-1">
        <Text variant="overlineSm" className={cn(COL_SET, 'text-center')}>
          {t('workouts:logger.set')}
        </Text>
        <Text variant="overlineSm" className="flex-1 pl-2" numberOfLines={1}>
          {previous === null ? '' : t('workouts:logger.previous')}
        </Text>
        {fields.map((field) => (
          <Text
            key={field}
            variant="overlineSm"
            className={cn(fieldWidth(fields.length), 'text-center')}
            numberOfLines={1}
          >
            {heading(field)}
          </Text>
        ))}
        {checkable ? <View className={COL_CHECK} /> : null}
      </View>

      {sets.map((set, index) => {
        const badge = badges[index]
        return (
          <SetRow
            key={set.id}
            exerciseKey={exerciseKey}
            exerciseName={exerciseName}
            set={set}
            badgeLabel={badge.label}
            badgeTone={badge.tone}
            badgeNumber={badge.number}
            tracking={tracking}
            last={previous?.[index]}
            showPrevious={previous !== null}
            unit={unit}
            distanceUnit={distanceUnit}
            record={recordIds.has(set.id)}
            checkable={checkable}
            plates={plates}
            handlers={handlers}
          />
        )
      })}
    </View>
  )
}

function fillFrom(last: LastSet): SetPatch {
  return {
    weightKg: last.weightKg,
    reps: last.reps,
    durationS: last.durationS,
    distanceM: last.distanceM,
  }
}

/** "60 × 8", "1:30", "5.2 km · 28:00": last time, in the row's own terms. */
export function describeSet(
  set: Pick<LastSet, 'weightKg' | 'reps' | 'durationS' | 'distanceM'>,
  tracking: Tracking,
  unit: WeightUnit,
  distanceUnit: DistanceUnit,
  /** The weight unit's symbol, for a line that stands on its own rather than in a column. */
  unitLabel?: string,
): string {
  const figure = set.weightKg === null ? null : weightField(set.weightKg, unit)
  const weight = figure !== null && unitLabel ? `${figure} ${unitLabel}` : figure
  switch (tracking) {
    case 'weight_reps':
      return weight !== null && set.reps !== null ? `${weight} × ${set.reps}` : ''
    case 'weighted_reps':
      if (set.reps === null) return ''
      return set.weightKg ? `+${weight} × ${set.reps}` : `× ${set.reps}`
    case 'assisted_reps':
      if (set.reps === null) return ''
      return set.weightKg ? `−${weight} × ${set.reps}` : `× ${set.reps}`
    case 'reps':
      return set.reps === null ? '' : `× ${set.reps}`
    case 'duration':
      return set.durationS === null ? '' : shortClock(set.durationS)
    case 'distance_duration': {
      const parts = [
        set.distanceM ? `${distanceField(set.distanceM, distanceUnit)} ${distanceUnit}` : null,
        set.durationS ? shortClock(set.durationS) : null,
      ].filter(Boolean)
      return parts.join(' · ')
    }
    case 'weight_distance':
      return weight !== null && set.distanceM ? `${weight} · ${trim(set.distanceM, 0)} m` : ''
  }
}

/**
 * One set. Memoised, with nothing but plain values and the editor's one
 * handlers object for props, so typing into one set re-renders that row and
 * not every row and field in the workout.
 */
const SetRow = memo(function SetRow({
  exerciseKey,
  exerciseName,
  set,
  badgeLabel: badge,
  badgeTone,
  badgeNumber,
  tracking,
  last,
  showPrevious,
  unit,
  distanceUnit,
  record,
  checkable,
  plates,
  handlers,
}: {
  exerciseKey: string
  exerciseName: string
  set: LiveSet
  badgeLabel: string
  badgeTone: string
  badgeNumber: number
  tracking: Tracking
  last: LastSet | undefined
  showPrevious: boolean
  unit: WeightUnit
  distanceUnit: DistanceUnit
  record: boolean
  checkable: boolean
  plates: boolean
  handlers: CardHandlers
}) {
  const onChange = (patch: SetPatch) => handlers.changeSet(exerciseKey, set.id, patch)
  const onToggle = () => handlers.toggleSet(exerciseKey, set, last ? fillFrom(last) : undefined)
  const onMenu = () => handlers.setMenu(exerciseKey, set, badgeNumber)
  const onPlates = plates ? (kg: number | null) => handlers.plates(exerciseKey, kg) : undefined
  const { t } = useTranslation(['workouts', 'common'])
  const colors = useThemeColors()
  const fields = fieldsFor(tracking)
  // Drawn as done only where a tick means something; see `checkable`.
  const ticked = checkable && set.done
  const previousText = last ? describeSet(last, tracking, unit, distanceUnit) : ''

  return (
    <View
      // Kept as a view of its own. An untouched row draws nothing, so it is
      // flattened away, and on Android the view brought back when a tick gave
      // it a background came back without its rounded corners.
      collapsable={false}
      className={cn(
        'min-h-[46px] flex-row items-center rounded-md px-1',
        ticked ? 'bg-pandan-soft' : undefined,
      )}
    >
      <Tappable
        className={cn(COL_SET, 'h-[40px] items-center justify-center rounded-sm')}
        onPress={onMenu}
        accessibilityRole="button"
        accessibilityLabel={`${t('workouts:logger.set')} ${badge}`}
      >
        <Text className={cn('font-display text-[17px]', badgeTone)}>{badge}</Text>
      </Tappable>

      {/* Tapping last time's figure copies it in, for the set that is the
          same as last week's. */}
      <Tappable
        className="h-[40px] flex-1 justify-center pl-2"
        disabled={!last || ticked}
        onPress={() => {
          if (!last) return
          onChange(fillFrom(last))
        }}
        accessibilityRole="button"
        accessibilityLabel={previousText || t('workouts:logger.previous')}
      >
        {showPrevious ? (
          <Text variant="meta" numberOfLines={1} className="text-faint">
            {previousText || t('workouts:logger.noPrevious')}
          </Text>
        ) : null}
      </Tappable>

      {fields.map((field) => {
        const key = fieldKey(exerciseKey, set.id, field)
        // "Bench Press · Set 2 · kg": the field is often under the pad.
        const header = (unitLabel: string) =>
          `${exerciseName} · ${t('workouts:logger.set')} ${badge} · ${unitLabel}`
        return (
          <View key={field} className={cn(fieldWidth(fields.length), 'px-1')}>
            {field === 'weight' ? (
              <NumberCell
                fieldKey={key}
                value={weightField(set.weightKg, unit)}
                placeholder={last ? weightField(last.weightKg, unit) : ''}
                decimal
                done={ticked}
                label={header(t(UNIT_KEY[unit]))}
                step={{
                  label: unit === 'lb' ? '5' : '2.5',
                  by: (direction) => {
                    const base = fromKg(set.weightKg ?? last?.weightKg ?? 0, unit)
                    const next = Math.max(0, base + direction * (unit === 'lb' ? 5 : 2.5))
                    onChange({ weightKg: parseWeight(trim(next, 2), unit) })
                  },
                }}
                plates={
                  onPlates
                    ? { label: t('workouts:logger.plates'), open: () => onPlates(set.weightKg) }
                    : undefined
                }
                onCommit={(text) => onChange({ weightKg: parseWeight(text, unit) })}
              />
            ) : field === 'reps' ? (
              <NumberCell
                fieldKey={key}
                value={set.reps === null ? '' : String(set.reps)}
                placeholder={last?.reps != null ? String(last.reps) : ''}
                decimal={false}
                done={ticked}
                label={header(t('workouts:logger.reps'))}
                step={{
                  label: '1',
                  by: (direction) =>
                    onChange({ reps: Math.max(0, (set.reps ?? last?.reps ?? 0) + direction) }),
                }}
                onCommit={(text) => onChange({ reps: parseWhole(text) })}
              />
            ) : field === 'duration' ? (
              <DurationCell
                fieldKey={key}
                seconds={set.durationS}
                placeholder={last?.durationS != null ? shortClock(last.durationS) : '0:00'}
                done={ticked}
                label={header(t('workouts:logger.time'))}
                step={{
                  label: t('workouts:logger.timeStep'),
                  by: (direction) =>
                    onChange({
                      durationS: Math.max(
                        0,
                        (set.durationS ?? last?.durationS ?? 0) + direction * 15,
                      ),
                    }),
                }}
                onCommit={(seconds) => onChange({ durationS: seconds })}
              />
            ) : tracking === 'weight_distance' ? (
              // A carry is tens of metres, and in kilometres the smallest step
              // the field can hold (0.01) is already ten of them.
              <NumberCell
                fieldKey={key}
                value={set.distanceM === null ? '' : trim(set.distanceM, 0)}
                placeholder={last?.distanceM ? trim(last.distanceM, 0) : ''}
                decimal={false}
                done={ticked}
                label={header('m')}
                step={{
                  label: '5',
                  by: (direction) =>
                    onChange({
                      distanceM: Math.max(
                        0,
                        (set.distanceM ?? last?.distanceM ?? 0) + direction * 5,
                      ),
                    }),
                }}
                onCommit={(text) => onChange({ distanceM: parseWhole(text) })}
              />
            ) : (
              <NumberCell
                fieldKey={key}
                value={distanceField(set.distanceM, distanceUnit)}
                placeholder={last ? distanceField(last.distanceM, distanceUnit) : ''}
                decimal
                done={ticked}
                label={header(distanceUnit)}
                step={{
                  label: '0.1',
                  by: (direction) => {
                    const base = Number(
                      distanceField(set.distanceM ?? last?.distanceM ?? 0, distanceUnit),
                    )
                    const next = Math.max(0, base + direction * 0.1)
                    onChange({ distanceM: parseDistance(trim(next, 2), distanceUnit) })
                  },
                }}
                onCommit={(text) => onChange({ distanceM: parseDistance(text, distanceUnit) })}
              />
            )}
          </View>
        )
      })}

      {checkable ? (
        <Tappable
          className={cn(COL_CHECK, 'h-[40px] items-center justify-center')}
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: set.done }}
          accessibilityLabel={`${t('workouts:logger.set')} ${badge}`}
        >
          {set.done ? (
            <View className="h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-pandan">
              <Icon set="ui" name="check" size={20} tintColor={colors.onPandan} />
            </View>
          ) : (
            <View className="h-[30px] w-[30px] rounded-[9px] border-2 border-line-strong bg-surface" />
          )}
        </Tappable>
      ) : null}

      {record ? (
        <View className="absolute right-[44px] top-[2px]">
          <Icon set="system" name="trophy" size={16} accessibilityLabel={t('workouts:logger.pr')} />
        </View>
      ) : null}
    </View>
  )
})

/** How a field steps: the keys read `+label` and `−label`. */
type CellStep = { label: string; by: (direction: 1 | -1) => void }
type CellPlates = { label: string; open: () => void }

/**
 * The pad's tools column for a set field: step the value, open the plate
 * calculator on a barbell's weight, and Next through the workout in the order
 * `fieldOrder.tsx` keeps. `input` is read when a key is pressed, because the
 * field's ref belongs to `useNumpadField`, which is called after this.
 */
function useCellTools(
  fieldKey: string,
  step: CellStep,
  plates: CellPlates | undefined,
  input: () => TextInput | null,
): NumpadTools {
  const { t } = useTranslation(['workouts', 'common'])
  const order = useFieldOrder(fieldKey, () => input()?.focus())
  return {
    step: {
      label: step.label,
      up: () => step.by(1),
      down: () => step.by(-1),
      upLabel: `${t('common:a11y.increase')} ${step.label}`,
      downLabel: `${t('common:a11y.decrease')} ${step.label}`,
    },
    next: order
      ? {
          // Read when the pad draws, not when this row last rendered: a set
          // added below a memoised row would otherwise leave it saying Done.
          get label() {
            return order.hasNext(fieldKey) ? t('workouts:logger.next') : t('common:action.done')
          },
          onPress: () => {
            if (!order.next(fieldKey)) input()?.blur()
          },
        }
      : undefined,
    accessory: plates
      ? {
          label: plates.label,
          // The pad goes first: the calculator is a sheet, and the pad is
          // drawn by the screen under it.
          onPress: () => {
            input()?.blur()
            plates.open()
          },
        }
      : undefined,
  }
}

/**
 * Android draws a field's placeholder only as it was when the field mounted.
 * A new exercise's rows mount before last time's numbers arrive, and changing
 * the prop afterwards left those rows blank while PREVIOUS beside them filled
 * in. Keyed on it there, the field is remounted with its hint. iOS updates the
 * hint in place.
 */
const hintKey = (placeholder: string) => (Platform.OS === 'android' ? placeholder : undefined)

/**
 * A number typed on the app's own pad. Holds its text while focused, so "62."
 * is not rounded to "62" between two key presses, and writes the parsed value
 * through on every change so nothing typed is lost if the app is killed.
 */
function NumberCell({
  fieldKey,
  value,
  placeholder,
  decimal,
  done,
  label,
  step,
  plates,
  onCommit,
}: {
  fieldKey: string
  value: string
  placeholder: string
  decimal: boolean
  done: boolean
  label: string
  step: CellStep
  plates?: CellPlates
  onCommit: (text: string) => void
}) {
  const colors = useThemeColors()
  const input = useRef<() => TextInput | null>(() => null)
  const tools = useCellTools(fieldKey, step, plates, () => input.current())
  const [typed, setTyped] = useState<string | null>(null)
  const change = (next: string) => {
    setTyped(next)
    onCommit(next)
  }
  // The text being typed is held so "60." can sit there half finished, but a
  // value changed from outside (last time's figure tapped in while this field
  // was still focused) wins: otherwise the cell showed 60 and the set saved
  // 62.5.
  useEffect(() => {
    setTyped((current) => {
      if (current === null) return current
      const same =
        current.trim() === ''
          ? value === ''
          : value !== '' && Number(current.replace(',', '.')) === Number(value.replace(',', '.'))
      return same ? current : null
    })
  }, [value])
  const numpad = useNumpadField({
    value: typed ?? value,
    onChangeText: change,
    decimal,
    maxLength: 6,
    label,
    replaceFirst: true,
    tools,
    onFocus: () => setTyped(value),
    onBlur: () => setTyped(null),
  })
  input.current = () => numpad.ref.current

  return (
    <TextInput
      key={hintKey(placeholder)}
      value={typed ?? value}
      onChangeText={change}
      placeholder={placeholder}
      placeholderTextColor={colors.faint}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      underlineColorAndroid="transparent"
      accessibilityLabel={label}
      className={cn(
        'h-[38px] rounded-sm border-2 px-1 text-center font-body-black text-[16px] text-ink',
        done ? 'bg-transparent' : 'bg-surface-alt',
        // The field the pad is typing into, since the pad covers the page
        // below it and the header alone is easy to miss.
        numpad.selection ? 'border-pandan bg-surface' : 'border-transparent',
      )}
      {...numpad}
    />
  )
}

/**
 * A time, typed the way a microwave reads it: "130" is 1:30. See
 * `digitsToSeconds`.
 */
function DurationCell({
  fieldKey,
  seconds,
  placeholder,
  done,
  label,
  step,
  onCommit,
}: {
  fieldKey: string
  seconds: number | null
  placeholder: string
  done: boolean
  label: string
  step: CellStep
  onCommit: (seconds: number | null) => void
}) {
  const colors = useThemeColors()
  const input = useRef<() => TextInput | null>(() => null)
  const tools = useCellTools(fieldKey, step, undefined, () => input.current())
  const [digits, setDigits] = useState<string | null>(null)
  const change = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, 6)
    setDigits(clean)
    onCommit(digitsToSeconds(clean))
  }
  // As in `NumberCell`: a time changed from outside while focused wins.
  useEffect(() => {
    setDigits((current) =>
      current === null || digitsToSeconds(current) === seconds ? current : null,
    )
  }, [seconds])
  const numpad = useNumpadField({
    value: digits ?? secondsToDigits(seconds),
    onChangeText: change,
    decimal: false,
    maxLength: 6,
    label,
    replaceFirst: true,
    tools,
    onFocus: () => setDigits(secondsToDigits(seconds)),
    onBlur: () => setDigits(null),
  })
  input.current = () => numpad.ref.current
  const shown = digits !== null ? digitsClock(digits) : seconds === null ? '' : shortClock(seconds)

  return (
    <TextInput
      key={hintKey(placeholder)}
      value={shown}
      onChangeText={change}
      placeholder={placeholder}
      placeholderTextColor={colors.faint}
      keyboardType="number-pad"
      underlineColorAndroid="transparent"
      accessibilityLabel={label}
      className={cn(
        'h-[38px] rounded-sm border-2 px-1 text-center font-body-black text-[16px] text-ink',
        done ? 'bg-transparent' : 'bg-surface-alt',
        // The field the pad is typing into, since the pad covers the page
        // below it and the header alone is easy to miss.
        numpad.selection ? 'border-pandan bg-surface' : 'border-transparent',
      )}
      {...numpad}
      // The pad writes digits and the field shows a clock, so the caret is put
      // at the end of what is shown rather than of what was typed.
      selection={numpad.selection ? { start: shown.length, end: shown.length } : undefined}
    />
  )
}
