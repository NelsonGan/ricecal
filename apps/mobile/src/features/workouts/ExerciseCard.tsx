import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextInput, View } from 'react-native'

import type { LastSet } from '@/data'
import type { WeightUnit } from '@/lib/units'
import { useThemeColors } from '@/theme/useTheme'
import { Card, cn, Icon, IconButton, Tappable, Text } from '@/ui'
import type { Category } from './catalogue'
import { ExerciseArt } from './ExerciseArt'
import { type DistanceUnit, shortClock } from './format'
import type { LiveExercise, LiveSet, SetPatch } from './model'
import { SetTable } from './SetTable'

export type ExerciseCardProps = {
  exercise: LiveExercise
  category: Category
  previous: readonly LastSet[] | undefined | null
  unit: WeightUnit
  distanceUnit: DistanceUnit
  /** Seconds the timer runs after a set when the exercise has none of its own. */
  defaultRestS: number
  /** "A", "B": the superset this exercise belongs to, if any. */
  supersetLabel: string | null
  recordIds: ReadonlySet<string>
  /** Off in a routine, which plans sets rather than doing them. */
  checkable: boolean
  onChangeSet: (setId: string, patch: SetPatch) => void
  onToggleSet: (set: LiveSet, fill: SetPatch | undefined) => void
  onSetMenu: (set: LiveSet, number: number) => void
  onAddSet: () => void
  onNotes: (notes: string) => void
  onMenu: () => void
  onRest: () => void
  onOpen: () => void
}

/**
 * One exercise in the logger: its drawing and name, a line for a note, the rest
 * timer it runs, and its sets.
 */
export function ExerciseCard({
  exercise,
  category,
  previous,
  unit,
  distanceUnit,
  defaultRestS,
  supersetLabel,
  recordIds,
  checkable,
  onChangeSet,
  onToggleSet,
  onSetMenu,
  onAddSet,
  onNotes,
  onMenu,
  onRest,
  onOpen,
}: ExerciseCardProps) {
  const { t } = useTranslation(['workouts', 'common'])
  const colors = useThemeColors()
  const [noting, setNoting] = useState(Boolean(exercise.notes))
  const restS = exercise.restS ?? defaultRestS

  return (
    <Card contentClassName="gap-3 px-4 py-4">
      {supersetLabel ? (
        <View className="flex-row items-center gap-1.5 self-start rounded-full bg-water-soft px-2.5 py-1">
          <Icon set="ui" name="link" size={14} />
          <Text variant="caption" className="text-water-ink">
            {t('workouts:logger.superset')} {supersetLabel}
          </Text>
        </View>
      ) : null}

      <View className="flex-row items-center gap-3">
        <Tappable onPress={onOpen} accessibilityRole="button" accessibilityLabel={exercise.name}>
          <ExerciseArt exerciseId={exercise.exerciseId} category={category} size={56} />
        </Tappable>
        <Tappable
          className="min-w-0 flex-1 gap-1.5"
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={exercise.name}
        >
          <Text variant="bodyStrong" numberOfLines={2}>
            {exercise.name}
          </Text>
          <View className="flex-row flex-wrap items-center gap-2">
            <Tappable
              className="flex-row items-center gap-1 rounded-full bg-kaya-soft px-2.5 py-1"
              onPress={onRest}
              accessibilityRole="button"
              accessibilityLabel={t('workouts:logger.restTitle')}
            >
              <Icon set="system" name="clock" size={14} />
              <Text variant="caption" className="text-kaya-ink">
                {restS > 0
                  ? t('workouts:logger.rest', { time: shortClock(restS) })
                  : t('workouts:logger.restOff')}
              </Text>
            </Tappable>
            {!noting ? (
              <Tappable
                className="flex-row items-center gap-1 rounded-full bg-surface-alt px-2.5 py-1"
                onPress={() => setNoting(true)}
                accessibilityRole="button"
                accessibilityLabel={t('workouts:logger.exerciseNotes')}
              >
                <Icon set="ui" name="edit" size={14} />
                <Text variant="caption">{t('workouts:logger.exerciseNotes')}</Text>
              </Tappable>
            ) : null}
          </View>
        </Tappable>
        <IconButton
          onPress={onMenu}
          accessibilityLabel={t('common:action.edit')}
          variant="ghost"
          size="sm"
        >
          <Icon set="ui" name="more-horizontal" size={22} />
        </IconButton>
      </View>

      {noting ? (
        <TextInput
          value={exercise.notes}
          onChangeText={onNotes}
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
        tracking={exercise.tracking}
        sets={exercise.sets}
        previous={previous}
        unit={unit}
        distanceUnit={distanceUnit}
        recordIds={recordIds}
        checkable={checkable}
        onChange={onChangeSet}
        onToggle={onToggleSet}
        onSetMenu={onSetMenu}
      />

      <Tappable
        className={cn(
          'h-[44px] flex-row items-center justify-center gap-2 rounded-md bg-surface-alt',
        )}
        onPress={onAddSet}
        accessibilityRole="button"
        accessibilityLabel={t('workouts:logger.addSet')}
      >
        <Icon set="ui" name="plus" size={18} />
        <Text variant="label">{t('workouts:logger.addSet')}</Text>
      </Tappable>
    </Card>
  )
}
