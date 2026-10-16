import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useExerciseBests, useLastSets, useSettings } from '@/data'
import { unitFor } from '@/lib/units'
import { Button, ConfirmSheet, EmptyState, useToast } from '@/ui'
import { ActionSheet, type SheetAction } from './ActionSheet'
import type { Tracking } from './catalogue'
import { RECORD_KEY, SET_KIND_KEY } from './copy'
import { ExerciseCard } from './ExerciseCard'
import { FieldOrderProvider } from './fieldOrder'
import { distanceUnitFor } from './format'
import { useExerciseLibrary } from './library'
import {
  type Action,
  apply,
  isLoggable,
  type LiveExercise,
  type LiveSet,
  type LiveWorkout,
  restAfter,
  SET_KINDS,
  type SetPatch,
  setHints,
} from './model'
import { PlateSheet } from './PlateSheet'
import { awaitPick } from './pick'
import { ReorderSheet } from './ReorderSheet'
import { RestSheet } from './RestSheet'
import { recordSets } from './records'
import type { CardHandlers } from './SetTable'
import { warmupSets } from './warmup'

/** Hardest first, as the sheet lists them. */
const RPE_SCALE = [10, 9, 8, 7, 6] as const

/** Counted in reps, so "2 reps left" means something; a run or a plank is not. */
const RATED: ReadonlySet<Tracking> = new Set([
  'weight_reps',
  'reps',
  'weighted_reps',
  'assisted_reps',
])

/**
 * The body of the logger: every exercise card, their menus, and the moves
 * between them. Shared by the live logger and by editing a finished workout,
 * which differ in their chrome (a running clock, a rest timer, "Finish" against
 * "Save") and not in how a set is typed.
 */

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
  // All-time bests, which only the live logger measures ticks against.
  const bests = useExerciseBests(null, { enabled: live }).data
  const bestsById = useMemo(
    () => new Map((bests ?? []).map((entry) => [entry.exerciseId, entry])),
    [bests],
  )

  const [menuFor, setMenuFor] = useState<LiveExercise | null>(null)
  const [reordering, setReordering] = useState(false)
  // Which card the menu asked to open its note on, and how many times.
  const [noteRequest, setNoteRequest] = useState<{ key: string; count: number } | null>(null)
  const [setMenu, setSetMenu] = useState<{
    exercise: LiveExercise
    set: LiveSet
    number: number
  } | null>(null)
  const [restFor, setRestFor] = useState<LiveExercise | null>(null)
  const [removeFor, setRemoveFor] = useState<LiveExercise | null>(null)
  // The set whose effort is being rated, from its menu.
  const [rpeFor, setRpeFor] = useState<{ exercise: LiveExercise; set: LiveSet } | null>(null)
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

  const setRpe = (target: { exercise: LiveExercise; set: LiveSet }, rpe: number | null) =>
    dispatch({
      type: 'updateSet',
      key: target.exercise.key,
      setId: target.set.id,
      patch: { rpe },
    })

  /** Ticks or unticks a set. False when it had no numbers to tick. */
  const toggle = (exercise: LiveExercise, set: LiveSet, fill: SetPatch | undefined): boolean => {
    if (set.done) {
      dispatch({ type: 'uncompleteSet', key: exercise.key, setId: set.id })
      return true
    }
    // The tick as `apply` will make it, on this exercise alone: what it fills
    // in decides whether the set can be ticked and whether it is a record.
    const at = Date.now()
    const action = { type: 'completeSet', key: exercise.key, setId: set.id, at, fill } as const
    const ticked = apply({ ...workout, exercises: [exercise] }, action).exercises[0]
    const tickedSet = ticked.sets.find((entry) => entry.id === set.id)
    if (!tickedSet || !isLoggable(tickedSet, exercise.tracking)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
      toast.show({ title: t('workouts:logger.noNumbers'), tone: 'error' })
      return false
    }

    const bests = bestsById.get(exercise.exerciseId)
    const before = recordSets(exercise, bests)
    dispatch(action)
    const after = recordSets(ticked, bests)
    const fresh = after.get(set.id)?.filter((kind) => !before.get(set.id)?.includes(kind))
    if (fresh?.length) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      toast.show({
        title: t('workouts:logger.pr'),
        description: `${exercise.name}: ${t(RECORD_KEY[fresh[0]])}`,
        tone: 'success',
      })
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    }

    if (live) {
      const rest = restAfter(workout, exercise, defaultRestS, set.id)
      if (rest > 0) dispatch({ type: 'startRest', exerciseKey: exercise.key, totalS: rest, at })
    }
    return true
  }

  // One handlers object for every card and row, keyed rather than closed over
  // each exercise, so it never changes and memoised cards skip the render
  // when their own exercise did not change. The latest document and `toggle`
  // are read through a ref at call time.
  const latest = useRef({ workout, toggle })
  latest.current = { workout, toggle }
  const handlers = useMemo<CardHandlers>(() => {
    const find = (key: string) =>
      latest.current.workout.exercises.find((exercise) => exercise.key === key)
    return {
      changeSet: (key, setId, patch) => dispatch({ type: 'updateSet', key, setId, patch }),
      toggleSet: (key, set, fill) => {
        const exercise = find(key)
        return exercise ? latest.current.toggle(exercise, set, fill) : false
      },
      setMenu: (key, set, number) => {
        const exercise = find(key)
        if (exercise) setSetMenu({ exercise, set, number })
      },
      plates: (key, kg) => {
        const exercise = find(key)
        if (exercise) setPlatesFor({ exercise, kg })
      },
      addSet: (key) => dispatch({ type: 'addSet', key }),
      removeSet: (key, setId) => dispatch({ type: 'removeSet', key, setId }),
      reorder: () => {
        if (latest.current.workout.exercises.length > 1) setReordering(true)
      },
      notes: (key, notes) => dispatch({ type: 'exerciseNotes', key, notes }),
      menu: (key) => setMenuFor(find(key) ?? null),
      rest: (key) => setRestFor(find(key) ?? null),
      open: (exerciseId) =>
        router.push({ pathname: '/workout/exercise/[id]', params: { id: exerciseId } }),
    }
  }, [dispatch, router])

  const exerciseActions = (exercise: LiveExercise): SheetAction[] => {
    const index = workout.exercises.findIndex((entry) => entry.key === exercise.key)
    const next = workout.exercises[index + 1]
    const actions: SheetAction[] = [
      ...(exercise.notes
        ? []
        : [
            {
              key: 'note',
              label: t('workouts:logger.exerciseNotes'),
              icon: { set: 'ui', name: 'edit' } as const,
              onPress: () =>
                setNoteRequest((last) => ({ key: exercise.key, count: (last?.count ?? 0) + 1 })),
            },
          ]),
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
          const sets = warmupSets(exercise, unit, {
            workingKg: offeredWeight(exercise, lastSets?.[exercise.exerciseId]),
            barbell: library.byId(exercise.exerciseId)?.equipment === 'barbell',
          })
          if (!sets.length) {
            toast.show({ title: t('workouts:warmup.needWeight'), tone: 'error' })
            return
          }
          dispatch({ type: 'addSets', key: exercise.key, sets, atStart: true })
          toast.show({ title: t('workouts:warmup.added', { count: sets.length }), tone: 'success' })
        },
      })
      // Plates only for a bar, as on the pad: a cable stack or a pair of
      // dumbbells has nothing to load.
      if (library.byId(exercise.exerciseId)?.equipment === 'barbell') {
        actions.push({
          key: 'plates',
          label: t('workouts:logger.menu.plates'),
          icon: { set: 'body', name: 'weight-plate' },
          onPress: () => setPlatesFor({ exercise }),
        })
      }
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
    if (workout.exercises.length > 1) {
      actions.push({
        key: 'reorder',
        label: t('workouts:logger.menu.reorder'),
        icon: { set: 'ui', name: 'reorder' },
        onPress: () => setReordering(true),
      })
    }
    actions.push({
      key: 'remove',
      label: t('workouts:logger.menu.remove'),
      icon: { set: 'ui', name: 'delete' },
      tone: 'danger',
      // Asked first only when it takes something with it: a card with every
      // set blank goes in one tap, one with sets in it takes them all.
      onPress: () =>
        exercise.sets.some(
          (set) =>
            set.done ||
            set.weightKg !== null ||
            set.reps !== null ||
            set.durationS !== null ||
            set.distanceM !== null,
        )
          ? setRemoveFor(exercise)
          : dispatch({ type: 'removeExercise', key: exercise.key }),
    })
    return actions
  }

  return (
    <FieldOrderProvider exercises={workout.exercises}>
      <View className="gap-stack">
        {workout.exercises.length === 0 ? (
          <EmptyState
            title={t('workouts:logger.emptyTitle')}
            icon={{ set: 'body', name: 'dumbbell' }}
          />
        ) : null}

        {workout.exercises.map((exercise) => {
          const info = library.byId(exercise.exerciseId)
          return (
            <ExerciseCard
              key={exercise.key}
              exercise={exercise}
              category={info?.category}
              previous={mode === 'edit' ? null : lastSets?.[exercise.exerciseId]}
              unit={unit}
              distanceUnit={distanceUnit}
              defaultRestS={defaultRestS}
              supersetLabel={
                exercise.superset !== null ? (supersetLetters.get(exercise.superset) ?? null) : null
              }
              bests={live ? bestsById.get(exercise.exerciseId) : undefined}
              // Ticking is training. Editing and logging after the fact save every
              // set with numbers in it, so a tick there would be a switch that
              // switched nothing.
              checkable={live}
              plates={info?.equipment === 'barbell'}
              noteRequest={noteRequest?.key === exercise.key ? noteRequest.count : 0}
              handlers={handlers}
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

        <ReorderSheet
          visible={reordering}
          items={workout.exercises.map((exercise) => ({
            key: exercise.key,
            exerciseId: exercise.exerciseId,
            name: exercise.name,
            category: library.byId(exercise.exerciseId)?.category,
          }))}
          onClose={() => setReordering(false)}
          onDone={(keys) => dispatch({ type: 'reorderExercises', keys })}
        />
        <ActionSheet
          visible={menuFor !== null}
          onClose={() => setMenuFor(null)}
          title={menuFor?.name}
          actions={menuFor ? exerciseActions(menuFor) : []}
        />

        <ActionSheet
          visible={setMenu !== null}
          onClose={() => setSetMenu(null)}
          title={
            setMenu
              ? setMenu.set.kind === 'warmup'
                ? t(SET_KIND_KEY.warmup)
                : `${t('workouts:logger.set')} ${setMenu.number}`
              : undefined
          }
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
                  // Rated once lifted: a routine is a plan, and saving one
                  // keeps no RPE.
                  ...(mode !== 'plan' && RATED.has(setMenu.exercise.tracking)
                    ? [
                        {
                          key: 'rpe',
                          label:
                            setMenu.set.rpe === null
                              ? t('workouts:logger.rpe')
                              : t('workouts:logger.rpeValue', { value: setMenu.set.rpe }),
                          icon: { set: 'body', name: 'heart-rate' } as const,
                          onPress: () =>
                            setRpeFor({ exercise: setMenu.exercise, set: setMenu.set }),
                        },
                      ]
                    : []),
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

        {/* Effort as reps left in the tank, the way a lifter says it: whole
            steps from 6 to 10, each named by what it means. */}
        <ActionSheet
          visible={rpeFor !== null}
          onClose={() => setRpeFor(null)}
          title={t('workouts:logger.rpeTitle')}
          actions={
            rpeFor
              ? [
                  ...RPE_SCALE.map((value) => ({
                    key: String(value),
                    label:
                      value === 10
                        ? t('workouts:logger.rpe10')
                        : t('workouts:logger.rpeLeft', { value, count: 10 - value }),
                    selected: rpeFor.set.rpe === value,
                    onPress: () => setRpe(rpeFor, value),
                  })),
                  {
                    key: 'none',
                    label: t('workouts:logger.rpeNone'),
                    selected: rpeFor.set.rpe === null,
                    onPress: () => setRpe(rpeFor, null),
                  },
                ]
              : []
          }
        />

        <RestSheet
          visible={restFor !== null}
          onClose={() => setRestFor(null)}
          title={t('workouts:logger.restTitle')}
          seconds={restFor?.restS ?? null}
          defaultS={defaultRestS}
          onPick={(restS) => {
            if (restFor) dispatch({ type: 'exerciseRest', key: restFor.key, restS })
          }}
          onUseDefault={() => {
            if (restFor) dispatch({ type: 'exerciseRest', key: restFor.key, restS: null })
          }}
        />

        <ConfirmSheet
          visible={removeFor !== null}
          onClose={() => setRemoveFor(null)}
          title={t('workouts:logger.removeTitle', { name: removeFor?.name ?? '' })}
          description={t('workouts:logger.removeBody')}
          confirmLabel={t('workouts:logger.menu.remove')}
          cancelLabel={t('common:action.keep')}
          onConfirm={() => {
            if (removeFor) dispatch({ type: 'removeExercise', key: removeFor.key })
            setRemoveFor(null)
          }}
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
            (platesFor
              ? offeredWeight(platesFor.exercise, lastSets?.[platesFor.exercise.exerciseId])
              : null)
          }
        />
      </View>
    </FieldOrderProvider>
  )
}

/**
 * The first working set's weight, typed or offered: a routine's rows show last
 * week's 100 kg as a hint, and "Add warm-ups" answered "enter a weight first"
 * over a screen full of them.
 */
function offeredWeight(
  exercise: LiveExercise,
  previous: Parameters<typeof setHints>[1],
): number | null {
  const hints = setHints(exercise.sets, previous)
  const index = exercise.sets.findIndex((set) => set.kind !== 'warmup')
  if (index === -1) return null
  return exercise.sets[index].weightKg ?? hints[index].weightKg
}
