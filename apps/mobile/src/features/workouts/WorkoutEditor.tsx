import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useExerciseBests, useLastSets, useSettings } from '@/data'
import { unitFor } from '@/lib/units'
import { Button, EmptyState, useToast } from '@/ui'
import { ActionSheet, type SheetAction } from './ActionSheet'
import { SET_KIND_KEY } from './copy'
import { ExerciseCard } from './ExerciseCard'
import { FieldOrderProvider } from './fieldOrder'
import { distanceUnitFor, shortClock } from './format'
import { useExerciseLibrary } from './library'
import {
  type Action,
  isLoggable,
  type LiveExercise,
  type LiveSet,
  type LiveWorkout,
  SET_KINDS,
  type SetPatch,
} from './model'
import { PlateSheet } from './PlateSheet'
import { awaitPick } from './pick'
import { recordSets } from './records'
import { warmupSets } from './warmup'

/**
 * The body of the logger: every exercise card, their menus, and the moves
 * between them. Shared by the live logger and by editing a finished workout,
 * which differ in their chrome (a running clock, a rest timer, "Finish" against
 * "Save") and not in how a set is typed.
 */

const REST_CHOICES = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300] as const

export type WorkoutEditorProps = {
  workout: LiveWorkout
  dispatch: (action: Action) => void
  /**
   * `live`: being trained, so ticking a set starts the rest timer. `edit`: a
   * finished workout, every set counts. `past`: the same, for one being logged
   * after the fact, which unlike an edit has a last time to show. `plan`: a
   * routine, which has targets rather than sets done, so there is nothing to
   * tick.
   */
  mode: 'live' | 'edit' | 'past' | 'plan'
}

export function WorkoutEditor({ workout, dispatch, mode }: WorkoutEditorProps) {
  const live = mode === 'live'
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const toast = useToast()
  const { data: settings } = useSettings()
  const unit = unitFor(settings?.units)
  const distanceUnit = distanceUnitFor(unit)
  const defaultRestS = settings?.workout_rest_s ?? 90
  const library = useExerciseLibrary()

  // Not asked for while editing: the newest workout with these exercises in
  // it is the one being edited, so "last time" would be itself.
  const ids = mode === 'edit' ? [] : workout.exercises.map((exercise) => exercise.exerciseId)
  const lastSets = useLastSets(ids).data
  const bests = useExerciseBests(null).data
  const bestsById = useMemo(
    () => new Map((bests ?? []).map((entry) => [entry.exerciseId, entry])),
    [bests],
  )

  const [menuFor, setMenuFor] = useState<LiveExercise | null>(null)
  const [setMenu, setSetMenu] = useState<{
    exercise: LiveExercise
    set: LiveSet
    number: number
  } | null>(null)
  const [restFor, setRestFor] = useState<LiveExercise | null>(null)
  // The exercise the calculator was opened for, and the weight to open it on
  // when it came from a set's own field rather than the exercise's menu.
  const [platesFor, setPlatesFor] = useState<{ exercise: LiveExercise; kg?: number | null } | null>(
    null,
  )

  // Superset groups are lettered in the order they first appear.
  const supersetLetters = useMemo(() => {
    const letters = new Map<number, string>()
    for (const exercise of workout.exercises) {
      if (exercise.superset !== null && !letters.has(exercise.superset)) {
        letters.set(exercise.superset, String.fromCharCode(65 + letters.size))
      }
    }
    return letters
  }, [workout.exercises])

  const openLibrary = (single: boolean, deliver: Parameters<typeof awaitPick>[0]['deliver']) => {
    awaitPick({ single, deliver })
    router.push({ pathname: '/workout/exercises', params: { pick: single ? 'one' : 'many' } })
  }

  const restAfter = (exercise: LiveExercise): number => {
    // In a superset the rest comes after the last exercise of the round, not
    // between its members.
    if (exercise.superset !== null) {
      const group = workout.exercises.filter((entry) => entry.superset === exercise.superset)
      if (group[group.length - 1]?.key !== exercise.key) return 0
    }
    return exercise.restS ?? defaultRestS
  }

  const toggle = (exercise: LiveExercise, set: LiveSet, fill: SetPatch | undefined) => {
    if (set.done) {
      dispatch({ type: 'uncompleteSet', key: exercise.key, setId: set.id })
      return
    }
    const filled = {
      weightKg: set.weightKg ?? fill?.weightKg ?? null,
      reps: set.reps ?? fill?.reps ?? null,
      durationS: set.durationS ?? fill?.durationS ?? null,
      distanceM: set.distanceM ?? fill?.distanceM ?? null,
    }
    if (!isLoggable(filled, exercise.tracking)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
      toast.show({ title: t('workouts:logger.noNumbers'), tone: 'error' })
      return
    }

    const before = recordSets(exercise, bestsById.get(exercise.exerciseId))
    const at = Date.now()
    dispatch({ type: 'completeSet', key: exercise.key, setId: set.id, at, fill })

    // Read back what the tick produced to see whether it set a record.
    const after = recordSets(
      {
        ...exercise,
        sets: exercise.sets.map((entry) =>
          entry.id === set.id ? { ...entry, ...filled, done: true, doneAt: at } : entry,
        ),
      },
      bestsById.get(exercise.exerciseId),
    )
    const fresh = after.get(set.id)?.filter((kind) => !before.get(set.id)?.includes(kind))
    if (fresh?.length) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      const label =
        fresh[0] === 'weight'
          ? t('workouts:logger.prWeight')
          : fresh[0] === 'e1rm'
            ? t('workouts:logger.prE1rm')
            : fresh[0] === 'volume'
              ? t('workouts:logger.prVolume')
              : t('workouts:logger.prReps')
      toast.show({
        title: t('workouts:logger.pr'),
        description: `${exercise.name}: ${label}`,
        tone: 'success',
      })
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    }

    if (live) {
      const rest = restAfter(exercise)
      if (rest > 0) dispatch({ type: 'startRest', exerciseKey: exercise.key, totalS: rest, at })
    }
  }

  const exerciseActions = (exercise: LiveExercise): SheetAction[] => {
    const index = workout.exercises.findIndex((entry) => entry.key === exercise.key)
    const next = workout.exercises[index + 1]
    const actions: SheetAction[] = [
      {
        key: 'details',
        label: t('workouts:logger.menu.details'),
        icon: { set: 'system', name: 'trophy' },
        onPress: () =>
          router.push({ pathname: '/workout/exercise/[id]', params: { id: exercise.exerciseId } }),
      },
      {
        key: 'replace',
        label: t('workouts:logger.menu.replace'),
        icon: { set: 'ui', name: 'swap' },
        onPress: () =>
          openLibrary(true, (plans) => {
            const plan = plans[0]
            if (plan) dispatch({ type: 'replaceExercise', key: exercise.key, plan })
          }),
      },
    ]
    if (exercise.tracking === 'weight_reps') {
      actions.push({
        key: 'warmups',
        label: t('workouts:logger.addWarmups'),
        icon: { set: 'body', name: 'stretching' },
        onPress: () => {
          const sets = warmupSets(exercise, unit)
          if (!sets.length) {
            toast.show({ title: t('workouts:warmup.needWeight'), tone: 'error' })
            return
          }
          dispatch({ type: 'addSets', key: exercise.key, sets, atStart: true })
          toast.show({ title: t('workouts:warmup.added', { count: sets.length }), tone: 'success' })
        },
      })
      actions.push({
        key: 'plates',
        label: t('workouts:logger.menu.plates'),
        icon: { set: 'body', name: 'weight-plate' },
        onPress: () => setPlatesFor({ exercise }),
      })
    }
    actions.push({
      key: 'rest',
      label: t('workouts:logger.menu.rest'),
      icon: { set: 'system', name: 'clock' },
      onPress: () => setRestFor(exercise),
    })
    if (exercise.superset !== null) {
      actions.push({
        key: 'unsuperset',
        label: t('workouts:logger.menu.unsuperset'),
        icon: { set: 'ui', name: 'unlink' },
        onPress: () => dispatch({ type: 'superset', key: exercise.key, withKey: null }),
      })
    } else if (next) {
      actions.push({
        key: 'superset',
        label: t('workouts:logger.menu.superset'),
        icon: { set: 'ui', name: 'link' },
        onPress: () => dispatch({ type: 'superset', key: exercise.key, withKey: next.key }),
      })
    }
    if (index > 0) {
      actions.push({
        key: 'up',
        label: t('workouts:logger.menu.moveUp'),
        icon: { set: 'ui', name: 'arrow-up' },
        onPress: () => dispatch({ type: 'moveExercise', key: exercise.key, by: -1 }),
      })
    }
    if (next) {
      actions.push({
        key: 'down',
        label: t('workouts:logger.menu.moveDown'),
        icon: { set: 'ui', name: 'arrow-down' },
        onPress: () => dispatch({ type: 'moveExercise', key: exercise.key, by: 1 }),
      })
    }
    actions.push({
      key: 'remove',
      label: t('workouts:logger.menu.remove'),
      icon: { set: 'ui', name: 'delete' },
      tone: 'danger',
      onPress: () => dispatch({ type: 'removeExercise', key: exercise.key }),
    })
    return actions
  }

  return (
    <FieldOrderProvider exercises={workout.exercises}>
      <View className="gap-stack">
        {workout.exercises.length === 0 ? (
          <EmptyState
            title={t('workouts:logger.emptyTitle')}
            description={t('workouts:logger.emptyBody')}
            icon={{ set: 'body', name: 'dumbbell' }}
          />
        ) : null}

        {workout.exercises.map((exercise) => {
          const info = library.byId(exercise.exerciseId)
          // Records only while training. Editing compares a saved workout with
          // bests that already include it, and every later one, so its trophies
          // are the saved page's to show.
          const records = live ? recordSets(exercise, bestsById.get(exercise.exerciseId)) : null
          return (
            <ExerciseCard
              key={exercise.key}
              exercise={exercise}
              category={info?.category ?? 'fullBody'}
              previous={mode === 'edit' ? null : lastSets?.[exercise.exerciseId]}
              unit={unit}
              distanceUnit={distanceUnit}
              defaultRestS={defaultRestS}
              supersetLabel={
                exercise.superset !== null ? (supersetLetters.get(exercise.superset) ?? null) : null
              }
              recordIds={new Set(records?.keys())}
              // Ticking is training. Editing and logging after the fact save every
              // set with numbers in it, so a tick there would be a switch that
              // switched nothing.
              checkable={live}
              onChangeSet={(setId, patch) =>
                dispatch({ type: 'updateSet', key: exercise.key, setId, patch })
              }
              onToggleSet={(set, fill) => toggle(exercise, set, fill)}
              onSetMenu={(set, number) => setSetMenu({ exercise, set, number })}
              onPlates={
                info?.equipment === 'barbell' ? (kg) => setPlatesFor({ exercise, kg }) : undefined
              }
              onAddSet={() => dispatch({ type: 'addSet', key: exercise.key })}
              onNotes={(notes) => dispatch({ type: 'exerciseNotes', key: exercise.key, notes })}
              onMenu={() => setMenuFor(exercise)}
              onRest={() => setRestFor(exercise)}
              onOpen={() =>
                router.push({
                  pathname: '/workout/exercise/[id]',
                  params: { id: exercise.exerciseId },
                })
              }
            />
          )
        })}

        <Button
          variant="secondary"
          fullWidth
          onPress={() => openLibrary(false, (plans) => dispatch({ type: 'addExercises', plans }))}
        >
          {t('workouts:logger.addExercise')}
        </Button>

        <ActionSheet
          visible={menuFor !== null}
          onClose={() => setMenuFor(null)}
          title={menuFor?.name}
          actions={menuFor ? exerciseActions(menuFor) : []}
        />

        <ActionSheet
          visible={setMenu !== null}
          onClose={() => setSetMenu(null)}
          title={setMenu ? `${t('workouts:logger.set')} ${setMenu.number}` : undefined}
          actions={
            setMenu
              ? [
                  ...SET_KINDS.map((kind) => ({
                    key: kind,
                    label: t(SET_KIND_KEY[kind]),
                    selected: setMenu.set.kind === kind,
                    onPress: () =>
                      dispatch({
                        type: 'updateSet',
                        key: setMenu.exercise.key,
                        setId: setMenu.set.id,
                        patch: { kind },
                      }),
                  })),
                  {
                    key: 'remove',
                    label: t('workouts:logger.removeSet'),
                    icon: { set: 'ui', name: 'delete' } as const,
                    tone: 'danger' as const,
                    onPress: () =>
                      dispatch({
                        type: 'removeSet',
                        key: setMenu.exercise.key,
                        setId: setMenu.set.id,
                      }),
                  },
                ]
              : []
          }
        />

        <ActionSheet
          visible={restFor !== null}
          onClose={() => setRestFor(null)}
          title={t('workouts:logger.restTitle')}
          actions={
            restFor
              ? [
                  {
                    key: 'default',
                    label: t('workouts:logger.restDefault', { time: shortClock(defaultRestS) }),
                    selected: restFor.restS === null,
                    onPress: () =>
                      dispatch({ type: 'exerciseRest', key: restFor.key, restS: null }),
                  },
                  ...REST_CHOICES.map((seconds) => ({
                    key: String(seconds),
                    label: seconds === 0 ? t('workouts:logger.restOff') : shortClock(seconds),
                    selected: restFor.restS === seconds,
                    onPress: () =>
                      dispatch({ type: 'exerciseRest', key: restFor.key, restS: seconds }),
                  })),
                ]
              : []
          }
        />

        <PlateSheet
          visible={platesFor !== null}
          onClose={() => setPlatesFor(null)}
          unit={unit}
          // The next set still to lift, or failing that the last working set:
          // the first weight on the card is usually the warm-up, which nobody
          // needs a calculator for.
          initialKg={
            platesFor?.kg ??
            platesFor?.exercise.sets.find((set) => !set.done && set.weightKg)?.weightKg ??
            platesFor?.exercise.sets.findLast((set) => set.kind !== 'warmup' && set.weightKg)
              ?.weightKg ??
            platesFor?.exercise.sets.find((set) => set.weightKg)?.weightKg ??
            null
          }
        />
      </View>
    </FieldOrderProvider>
  )
}
