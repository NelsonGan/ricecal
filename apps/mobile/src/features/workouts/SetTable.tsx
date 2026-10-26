import { memo, type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, TextInput, type TextInputInstance, View } from 'react-native'

import type { LastSet } from '@/data'
import { SwipeRow } from '@/features/shared/SwipeRow'
import { UNIT_KEY, type WeightUnit } from '@/lib/units'
import { useThemeColors } from '@/theme/useTheme'
import { cn, Icon, type NumpadTools, Tappable, Text, useNumpadField } from '@/ui'
import type { Tracking } from './catalogue'
import { SET_KIND_KEY, setBadges } from './copy'
import { fieldKey, useFieldOrder } from './fieldOrder'
import {
  type DistanceUnit,
  describeSet,
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
import { fieldsFor, type LiveSet, matchPrevious, type SetPatch, setHints } from './model'

/**
 * The sets of one exercise: the table the logger is mostly made of.
 *
 *   SET   PREVIOUS     KG     REPS    ✓
 *    W    40 × 10      40     10      ✓
 *    1    60 × 8       62.5   8       ✓ 🏆
 *
 * A row turns green when it is ticked. An empty field shows the figure above
 * it in its column, or last time's (`setHints`), and ticking an empty row takes
 * those: the commonest set in a gym is "the same again", and it should cost
 * one tap.
 */

/**
 * What a card and its rows call back with. One object for the whole editor,
 * keyed by exercise and set rather than closed over them, so it never changes
 * and a memoised row skips the render when nothing of its own did.
 */
export type CardHandlers = {
  changeSet: (key: string, setId: string, patch: SetPatch) => void
  /** False when the set could not be ticked: it has no numbers to tick. */
  toggleSet: (key: string, set: LiveSet, fill: SetPatch | undefined) => boolean
  setMenu: (key: string, set: LiveSet, number: number) => void
  addSet: (key: string) => void
  removeSet: (key: string, setId: string) => void
  /** Opens the reorder sheet. Keyed like the rest, though the order is the workout's. */
  reorder: (key: string) => void
  notes: (key: string, notes: string) => void
  menu: (key: string) => void
  rest: (key: string) => void
  open: (exerciseId: string) => void
}

type SetTableProps = {
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
  handlers: CardHandlers
}

const COL_SET = 'w-[34px]'
/** A row is 46pt and its cells 40, so each takes the row's height to tap. */
const ROW_SLOP = { top: 3, bottom: 3 }
const ROW_SLOP_EDGE = { top: 3, bottom: 3, left: 4 }
const ROW_SLOP_EDGE_RIGHT = { top: 3, bottom: 3, right: 4 }
const COL_FIELD = 'w-[66px]'
/**
 * A lone field gets the width two would have used: a plank or a class has only
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
  // Paired once: the hints are worked out from the same pairing.
  const lastTime = matchPrevious(sets, previous)
  const hints = setHints(sets, previous, lastTime)

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
        const hint = hints[index]
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
            last={lastTime[index]}
            hintWeight={hint.weightKg}
            hintReps={hint.reps}
            hintDuration={hint.durationS}
            hintDistance={hint.distanceM}
            showPrevious={previous !== null}
            unit={unit}
            distanceUnit={distanceUnit}
            record={recordIds.has(set.id)}
            checkable={checkable}
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
  hintWeight,
  hintReps,
  hintDuration,
  hintDistance,
  showPrevious,
  unit,
  distanceUnit,
  record,
  checkable,
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
  /** The figures an empty field offers. Plain values, so the row stays memoised. */
  hintWeight: number | null
  hintReps: number | null
  hintDuration: number | null
  hintDistance: number | null
  showPrevious: boolean
  unit: WeightUnit
  distanceUnit: DistanceUnit
  record: boolean
  checkable: boolean
  handlers: CardHandlers
}) {
  const onChange = (patch: SetPatch) => handlers.changeSet(exerciseKey, set.id, patch)
  const onToggle = () =>
    handlers.toggleSet(exerciseKey, set, {
      weightKg: hintWeight,
      reps: hintReps,
      durationS: hintDuration,
      distanceM: hintDistance,
    })
  // The pad's tick: a set already ticked is left ticked, and the pad moves on.
  const onComplete = checkable ? () => set.done || onToggle() : undefined
  const onMenu = () => handlers.setMenu(exerciseKey, set, badgeNumber)
  const { t } = useTranslation(['workouts', 'common'])
  const colors = useThemeColors()
  const fields = fieldsFor(tracking)
  // Drawn as done only where a tick means something; see `checkable`.
  const ticked = checkable && set.done
  const previousText = last ? describeSet(last, tracking, unit, distanceUnit) : ''
  // Spoken: "Set 2", or the kind where the badge is a letter ("W" read aloud
  // says nothing). The tick also names the exercise, since it is reached alone.
  const setName =
    set.kind === 'normal'
      ? `${t('workouts:logger.set')} ${badge}`
      : set.kind === 'warmup'
        ? t(SET_KIND_KEY.warmup)
        : `${t('workouts:logger.set')} ${badgeNumber}, ${t(SET_KIND_KEY[set.kind])}`
  // What each number field shows, offers when empty, is called in the pad's
  // header, and reads back. A carry is tens of metres, and in kilometres the
  // smallest step the field can hold (0.01) is already ten of them.
  const numbers = {
    weight: {
      value: weightField(set.weightKg, unit),
      hint: weightField(hintWeight, unit),
      decimal: true,
      unit: t(UNIT_KEY[unit]),
      read: (text: string): SetPatch => ({ weightKg: parseWeight(text, unit) }),
    },
    reps: {
      value: set.reps === null ? '' : String(set.reps),
      hint: hintReps === null ? '' : String(hintReps),
      decimal: false,
      unit: t('workouts:logger.reps'),
      read: (text: string): SetPatch => ({ reps: parseWhole(text) }),
    },
    distance:
      tracking === 'weight_distance'
        ? {
            value: set.distanceM === null ? '' : trim(set.distanceM, 0),
            hint: hintDistance ? trim(hintDistance, 0) : '',
            decimal: false,
            unit: 'm',
            read: (text: string): SetPatch => ({ distanceM: parseWhole(text) }),
          }
        : {
            value: distanceField(set.distanceM, distanceUnit),
            hint: distanceField(hintDistance, distanceUnit),
            decimal: true,
            unit: distanceUnit,
            read: (text: string): SetPatch => ({ distanceM: parseDistance(text, distanceUnit) }),
          },
  }

  return (
    // Swiped left, a set shows Delete, as every gym logger's sets do, and a
    // swipe carried across deletes it outright.
    <SwipeRow
      square
      actions={[
        {
          label: t('common:action.delete'),
          a11yLabel: `${t('workouts:logger.removeSet')} ${badge}`,
          icon: 'delete',
          tone: 'hibiscus',
          exits: true,
          fullSwipe: true,
          onPress: () => handlers.removeSet(exerciseKey, set.id),
        },
      ]}
    >
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
          // The row's full height and its edge: the cell is drawn smaller than
          // a finger, and nothing sits above, below or left of it.
          hitSlop={ROW_SLOP_EDGE}
          onPress={onMenu}
          accessibilityRole="button"
          // The label replaces the text inside, so the RPE has to be in it.
          accessibilityLabel={
            set.rpe === null
              ? setName
              : `${setName}, ${t('workouts:logger.rpeValue', { value: set.rpe })}`
          }
        >
          <Text className={cn('font-display text-[17px] leading-[20px]', badgeTone)}>{badge}</Text>
          {set.rpe !== null ? (
            // Small under the number: it qualifies the set rather than being one of its figures.
            <Text variant="micro" className="text-muted" numberOfLines={1}>
              {`@${set.rpe}`}
            </Text>
          ) : null}
        </Tappable>

        {/* Tapping last time's figure copies it in, for the set that is the
          same as last week's. */}
        <Tappable
          className="h-[40px] flex-1 justify-center pl-2"
          hitSlop={ROW_SLOP}
          disabled={!last || ticked}
          // Nothing to read or tap where last time is not shown (an edit).
          accessible={showPrevious}
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
          const number = field === 'duration' ? null : numbers[field]
          const unitLabel = number ? number.unit : t('workouts:logger.time')
          // "Bench Press" over "Set 2 · kg": the field is often under the pad.
          const label = `${exerciseName}\n${t('workouts:logger.set')} ${badge} · ${unitLabel}`
          return (
            <View key={field} className={cn(fieldWidth(fields.length), 'px-1')}>
              {number ? (
                <NumberCell
                  fieldKey={key}
                  value={number.value}
                  placeholder={number.hint}
                  decimal={number.decimal}
                  done={ticked}
                  label={label}
                  complete={onComplete}
                  onCommit={(text) => onChange(number.read(text))}
                />
              ) : (
                <DurationCell
                  fieldKey={key}
                  seconds={set.durationS}
                  placeholder={hintDuration === null ? '0:00' : shortClock(hintDuration)}
                  done={ticked}
                  label={label}
                  complete={onComplete}
                  onCommit={(seconds) => onChange({ durationS: seconds })}
                />
              )}
            </View>
          )
        })}

        {checkable ? (
          <Tappable
            className={cn(COL_CHECK, 'h-[40px] items-center justify-center')}
            hitSlop={ROW_SLOP_EDGE_RIGHT}
            onPress={onToggle}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: set.done }}
            accessibilityLabel={`${exerciseName}, ${setName}`}
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
            <Icon
              set="system"
              name="trophy"
              size={16}
              accessibilityLabel={t('workouts:logger.pr')}
            />
          </View>
        ) : null}
      </View>
    </SwipeRow>
  )
})

/**
 * The pad's tools for a set field: Next through the workout in the order
 * `fieldOrder.tsx` keeps, and a tick that completes the set and moves to the
 * next one. `input` is read when a key is pressed, because the field's ref
 * belongs to `useNumpadField`, which is called after this.
 */
function useCellTools(
  fieldKey: string,
  complete: (() => boolean) | undefined,
  input: () => TextInputInstance | null,
): NumpadTools {
  const { t } = useTranslation(['workouts', 'common'])
  const order = useFieldOrder(fieldKey, () => input()?.focus())
  return {
    next: {
      // Read when the pad draws, not when this row last rendered: a set
      // added below a memoised row would otherwise leave it saying Done.
      get label() {
        return order.hasNext(fieldKey) ? t('workouts:logger.next') : t('common:action.done')
      },
      onPress: () => {
        if (!order.next(fieldKey)) input()?.blur()
      },
    },
    complete: complete
      ? {
          label: t('workouts:logger.set'),
          accessibilityLabel: t('workouts:logger.completeSet'),
          onPress: () => {
            if (!complete()) return
            if (!order.nextSet(fieldKey)) input()?.blur()
          },
        }
      : undefined,
  }
}

/**
 * Android's own padding inside a text field, which left 38pt cells about ten
 * points for the number: it sat at the top and lost its lower half. iOS has
 * none to take away.
 */
const CELL_TEXT = {
  paddingVertical: 0,
  textAlignVertical: 'center',
  includeFontPadding: false,
} as const

/**
 * A set field's box: filled until its set is ticked, and outlined while the
 * pad types into it, since the pad covers the page below it and the header
 * alone is easy to miss.
 */
const cellClass = (done: boolean, typing: boolean) =>
  cn(
    'h-[38px] rounded-sm border-2 px-1 text-center font-body-black text-[16px] text-ink',
    done ? 'bg-transparent' : 'bg-surface-alt',
    typing ? 'border-pandan bg-surface' : 'border-transparent',
  )

/**
 * Android draws a field's placeholder only as it was when the field mounted.
 * A new exercise's rows mount before last time's numbers arrive, and changing
 * the prop afterwards left those rows blank while PREVIOUS beside them filled
 * in. Keyed on it there, the field is remounted with its hint. iOS updates the
 * hint in place.
 */
const hintKey = (placeholder: string) => (Platform.OS === 'android' ? placeholder : undefined)

/**
 * On Android a text field keeps a drag that starts on it whenever its own
 * content can scroll (`ReactEditText.onTouchEvent`), and a field the pad has
 * typed into can. A drag that began on a set scrolled that field's text out of
 * its box, which left the cell blank until the workout was reopened, and the
 * page under the thumb did not move. The pad places the caret itself, so the
 * field needs no touches of its own: a press focuses it and a drag is the
 * page's. Screen readers still reach the field, which keeps its label.
 */
function CellTouch({ focus, children }: { focus: () => void; children: ReactNode }) {
  if (Platform.OS !== 'android') return children
  return (
    <Pressable onPress={focus} accessible={false}>
      <View pointerEvents="none">{children}</View>
    </Pressable>
  )
}

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
  complete,
  onCommit,
}: {
  fieldKey: string
  value: string
  placeholder: string
  decimal: boolean
  done: boolean
  label: string
  complete?: () => boolean
  onCommit: (text: string) => void
}) {
  const colors = useThemeColors()
  const input = useRef<() => TextInputInstance | null>(() => null)
  const tools = useCellTools(fieldKey, complete, () => input.current())
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
    <CellTouch focus={() => numpad.ref.current?.focus()}>
      <TextInput
        key={hintKey(placeholder)}
        value={typed ?? value}
        onChangeText={change}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        underlineColorAndroid="transparent"
        accessibilityLabel={label}
        style={CELL_TEXT}
        className={cellClass(done, Boolean(numpad.selection))}
        {...numpad}
      />
    </CellTouch>
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
  complete,
  onCommit,
}: {
  fieldKey: string
  seconds: number | null
  placeholder: string
  done: boolean
  label: string
  complete?: () => boolean
  onCommit: (seconds: number | null) => void
}) {
  const colors = useThemeColors()
  const input = useRef<() => TextInputInstance | null>(() => null)
  const tools = useCellTools(fieldKey, complete, () => input.current())
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
    <CellTouch focus={() => numpad.ref.current?.focus()}>
      <TextInput
        key={hintKey(placeholder)}
        value={shown}
        onChangeText={change}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        keyboardType="number-pad"
        underlineColorAndroid="transparent"
        accessibilityLabel={label}
        style={CELL_TEXT}
        className={cellClass(done, Boolean(numpad.selection))}
        {...numpad}
        // The pad writes digits and the field shows a clock, so the selection is
        // measured on what is shown rather than on what was typed: all of it while
        // the next key replaces it, otherwise the caret at the end.
        selection={
          numpad.selection
            ? {
                start: numpad.selection.start === 0 && numpad.selection.end > 0 ? 0 : shown.length,
                end: shown.length,
              }
            : undefined
        }
      />
    </CellTouch>
  )
}
