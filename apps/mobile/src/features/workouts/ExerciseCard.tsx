import { memo, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextInput, View } from 'react-native'

import { type ExerciseBests, type LastSet, useCurrentWeight } from '@/data'
import type { WeightUnit } from '@/lib/units'
import { useThemeColors } from '@/theme/useTheme'
import { Badge, Card, Icon, IconButton, Tappable, Text } from '@/ui'
import type { Category } from './catalogue'
import { ExerciseArt } from './ExerciseArt'
import { type DistanceUnit, shortClock } from './format'
import type { LiveExercise } from './model'
import { recordSets } from './records'
import { type CardHandlers, SetTable } from './SetTable'

type ExerciseCardProps = {
  exercise: LiveExercise
  /** The body part, for the drawing's fallback. A custom or retired exercise may have none. */
  category: Category | undefined
  previous: readonly LastSet[] | undefined | null
  unit: WeightUnit
  distanceUnit: DistanceUnit
  /** Seconds the timer runs after a set when the exercise has none of its own. */
  defaultRestS: number
  /** "A", "B": the superset this exercise belongs to, if any. */
  supersetLabel: string | null
  /** The bests a tick is measured against, live; undefined anywhere else. */
  bests: ExerciseBests | undefined
  /**
   * Every card of this exercise in card order, when it appears in more than
   * one: records are scored across them, as the server scores them.
   */
  sameExercise?: readonly LiveExercise[]
  /** On in the live logger only: elsewhere every set with numbers in it counts. */
  checkable: boolean
  /**
   * Bumped by the exercise menu's "Add a note", which opens the note field. A
   * count rather than a flag, so asking twice opens it twice.
   */
  noteRequest: number
  handlers: CardHandlers
}

const NO_RECORDS: ReadonlySet<string> = new Set()

/**
 * One exercise in the logger: its drawing and name, a line for a note, the rest
 * timer it runs, and its sets.
 */
export const ExerciseCard = memo(function ExerciseCard({
  exercise,
  category,
  previous,
  unit,
  distanceUnit,
  defaultRestS,
  supersetLabel,
  bests,
  sameExercise,
  checkable,
  noteRequest,
  handlers,
}: ExerciseCardProps) {
  const { t } = useTranslation(['workouts', 'common'])
  const colors = useThemeColors()
  const [noting, setNoting] = useState(Boolean(exercise.notes))
  useEffect(() => {
    if (noteRequest > 0) setNoting(true)
  }, [noteRequest])
  const restS = exercise.restS ?? defaultRestS
  const restText =
    restS > 0
      ? t('workouts:logger.rest', { time: shortClock(restS) })
      : t('workouts:logger.restOff')
  const key = exercise.key
  const open = () => handlers.open(exercise.exerciseId)
  const reorder = () => handlers.reorder(key)
  // Records only while training. Editing compares a saved workout with bests
  // that already include it, and every later one, so its trophies are the
  // saved page's to show.
  const bodyKg = useCurrentWeight()
  const recordIds = useMemo(
    () =>
      checkable && bests
        ? new Set(recordSets(sameExercise ?? exercise, bests, bodyKg).keys())
        : NO_RECORDS,
    [checkable, exercise, sameExercise, bests, bodyKg],
  )

  return (
    <Card contentClassName="gap-3 px-4 py-4">
      {supersetLabel ? (
        <Badge tone="water" size="sm">
          <Icon set="ui" name="link" size={14} />
          <Text variant="caption" className="text-water-ink">
            {t('workouts:logger.superset')} {supersetLabel}
          </Text>
        </Badge>
      ) : null}

      <View className="flex-row items-center gap-3">
        {/* A long press on the exercise picks it up into the reorder sheet,
            the way a long press lifts a row in Hevy. */}
        {/* The same action as the name beside it, so one element to VoiceOver. */}
        <Tappable onPress={open} onLongPress={reorder} accessible={false}>
          <ExerciseArt exerciseId={exercise.exerciseId} category={category} size={56} />
        </Tappable>
        {/* One element to VoiceOver, so the rest chip inside it cannot be
            reached on its own: its figure is read with the name, and opening
            it is the element's action. */}
        <Tappable
          className="min-w-0 flex-1 gap-1.5"
          onPress={open}
          onLongPress={reorder}
          accessibilityRole="button"
          accessibilityLabel={`${exercise.name}, ${restText}`}
          accessibilityActions={[{ name: 'rest', label: t('workouts:logger.restTitle') }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'rest') handlers.rest(key)
          }}
        >
          <Text variant="bodyStrong" numberOfLines={2}>
            {exercise.name}
          </Text>
          <View className="flex-row flex-wrap items-center gap-2">
            <Tappable
              className="flex-row items-center gap-1 rounded-full bg-kaya-soft px-2.5 py-1"
              // About 26pt drawn, inside the name's own target: a near miss
              // opened the exercise's page instead.
              hitSlop={{ top: 9, bottom: 9, left: 6, right: 6 }}
              onPress={() => handlers.rest(key)}
              accessibilityRole="button"
              accessibilityLabel={t('workouts:logger.restTitle')}
            >
              <Icon set="system" name="clock" size={14} />
              <Text variant="caption" className="text-kaya-ink">
                {restText}
              </Text>
            </Tappable>
          </View>
        </Tappable>
        <IconButton
          onPress={() => handlers.menu(key)}
          accessibilityLabel={t('workouts:logger.menuFor', { name: exercise.name })}
          variant="ghost"
          size="sm"
        >
          <Icon set="ui" name="more-horizontal" size={22} />
        </IconButton>
      </View>

      {noting ? (
        <TextInput
          value={exercise.notes}
          onChangeText={(notes) => handlers.notes(key, notes)}
          placeholder={t('workouts:logger.exerciseNotes')}
          placeholderTextColor={colors.faint}
          multiline
          maxLength={1000}
          autoFocus={!exercise.notes}
          onBlur={() => {
            if (!exercise.notes.trim()) setNoting(false)
          }}
          className="rounded-md bg-surface-alt px-3 py-2 font-body-bold text-[15px] text-ink"
        />
      ) : null}

      <SetTable
        exerciseKey={exercise.key}
        exerciseName={exercise.name}
        tracking={exercise.tracking}
        sets={exercise.sets}
        previous={previous}
        unit={unit}
        distanceUnit={distanceUnit}
        recordIds={recordIds}
        checkable={checkable}
        handlers={handlers}
      />

      <Tappable
        className="h-[44px] flex-row items-center justify-center gap-2 rounded-md bg-surface-alt"
        onPress={() => handlers.addSet(key)}
        accessibilityRole="button"
        accessibilityLabel={t('workouts:logger.addSet')}
      >
        <Icon set="ui" name="plus" size={18} />
        {/* One line, said out loud: on Android a label exactly as wide as its
            text can lose its last word to rounding ("Add" on every card but
            the first), and a single line cannot wrap it away. */}
        <Text variant="label" numberOfLines={1}>
          {t('workouts:logger.addSet')}
        </Text>
      </Tappable>
    </Card>
  )
})
