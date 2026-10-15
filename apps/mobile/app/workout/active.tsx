import { useKeepAwake } from 'expo-keep-awake'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useLastSets, useSettings } from '@/data'
import {
  ActionSheet,
  completeAll,
  discardWorkout,
  doneSets,
  getActiveWorkout,
  liveTotals,
  RestBar,
  STALE_AFTER_MS,
  StaleWorkoutSheet,
  Stat,
  StatStrip,
  showsVolume,
  unfinishedSets,
  useLiveWorkout,
  useLoggerOpen,
  useNow,
  useWorkoutPrefs,
  volumeText,
  WorkoutEditor,
  WorkoutMissing,
  clock as workoutClock,
} from '@/features/workouts'
import { unitFor } from '@/lib/units'
import { AppBar, Button, ConfirmSheet, Screen } from '@/ui'

/**
 * The logger: a workout being trained.
 *
 * Everything on it is the document in `features/workouts/store.ts`, written
 * synchronously on every keystroke and tick, so minimising, locking the phone
 * or the app being killed loses nothing. Minimise keeps it running and shrinks
 * it to the bar over the tabs.
 */
export default function ActiveWorkoutScreen() {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const { userId, workout: current, dispatch, replace } = useLiveWorkout()
  useLoggerOpen()
  const { data: settings } = useSettings()
  const prefs = useWorkoutPrefs()
  const unit = unitFor(settings?.units)

  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [unfinished, setUnfinished] = useState(0)
  const [nothing, setNothing] = useState(false)
  const finishParams = useRef<FinishParams>({})

  // The last document seen, drawn while this screen leaves. Finishing and
  // discarding clear the workout and then navigate away, and in between the
  // screen re-renders with nothing; a <Redirect> there raced the navigation
  // and could mount the tabs a second time.
  const lastSeen = useRef(current)
  if (current) lastSeen.current = current
  const workout = current ?? lastSeen.current
  // Last time's sets, for what an unticked set offers. The editor asks for
  // the same key, so this reads its cache.
  const previous = useLastSets(workout?.exercises.map((exercise) => exercise.exerciseId) ?? []).data

  // A notice tapped after its workout was finished: say so, rather than redirect.
  if (!workout) return <WorkoutMissing />

  const totals = liveTotals(workout)

  // Sets showing numbers but not ticked are asked about, even when none are
  // ticked: a workout logged by typing and never ticking is the commonest
  // way to finish with "nothing to save".
  // `params` carries what "Still training?" chose (the last set's time, or
  // picking one) through the same checks to the save screen.
  const finish = (params: FinishParams = {}) => {
    finishParams.current = params
    const open = unfinishedSets(workout, previous)
    if (open > 0) {
      setUnfinished(open)
      return
    }
    if (doneSets(workout) === 0) {
      setNothing(true)
      return
    }
    router.push({ pathname: '/workout/finish', params })
  }

  const discard = async () => {
    if (userId) discardWorkout(userId, workout)
    router.dismissTo('/workouts')
  }

  return (
    <Screen
      // Set rows swipe to delete, so the scroll has to share the finger. See `gestureScroll`.
      gestureScroll
      header={
        <AppBar
          leading="minimise"
          // Back to wherever it was opened from; with nothing under it (a
          // notification that cold-launched straight here), to the tab.
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/workouts'))}
          backLabel={t('workouts:logger.minimise')}
          title={workout.name}
          onPressTitle={() => {
            setName(workout.name)
            setRenaming(true)
          }}
          titleEdit={
            renaming
              ? {
                  value: name,
                  onChangeText: setName,
                  onDone: () => {
                    setRenaming(false)
                    if (name.trim()) dispatch({ type: 'rename', name: name.trim() })
                  },
                  label: t('workouts:logger.namePlaceholder'),
                  maxLength: 80,
                }
              : undefined
          }
          action={
            <Button size="sm" onPress={() => finish()}>
              {t('workouts:logger.finish')}
            </Button>
          }
        />
      }
      footer={
        // The rest is cleared when it ends (by `useWorkoutEffects`), so this
        // shows exactly while one runs; the countdown keeps its own clock.
        workout.rest ? (
          <RestCountdown
            endsAt={workout.rest.endsAt}
            totalS={workout.rest.totalS}
            onAdjust={(byS) => dispatch({ type: 'adjustRest', byS, at: Date.now() })}
            onSkip={() => dispatch({ type: 'stopRest' })}
          />
        ) : undefined
      }
    >
      {prefs.keepAwake ? <KeepAwake /> : null}

      <StatStrip>
        <Elapsed label={t('workouts:logger.duration')} startedAt={workout.startedAt} />
        {showsVolume(workout.exercises.map((exercise) => exercise.tracking)) ? (
          <Stat label={t('workouts:logger.volume')} value={volumeText(t, totals.volumeKg, unit)} />
        ) : null}
        <Stat label={t('workouts:logger.sets')} value={String(totals.done)} />
      </StatStrip>

      <WorkoutEditor workout={workout} dispatch={dispatch} mode="live" />

      <Button variant="ghost" fullWidth onPress={() => setConfirmDiscard(true)}>
        {t('workouts:logger.discard')}
      </Button>

      <ConfirmSheet
        visible={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title={t('workouts:logger.discardTitle')}
        description={t('workouts:logger.discardBody')}
        confirmLabel={t('workouts:logger.discardConfirm')}
        cancelLabel={t('common:action.keep')}
        onConfirm={discard}
      />

      {/* Numbers typed into a set but never ticked: ask, rather than guess.
          Dismissing the sheet is the third answer, "not yet". */}
      <ActionSheet
        visible={unfinished > 0}
        onClose={() => setUnfinished(0)}
        title={t('workouts:finish.unfinishedTitle')}
        description={t('workouts:finish.unfinishedBody', { count: unfinished })}
        actions={[
          {
            key: 'complete',
            label: t('workouts:finish.completeThem'),
            icon: { set: 'ui', name: 'checkbox-checked' },
            onPress: () => {
              // The stored document, not this render's: a lock-screen tick or a
              // rest ending before the sheet closed would otherwise be undone.
              const latest = userId ? getActiveWorkout(userId) : null
              if (latest) replace(completeAll(latest, Date.now(), previous))
              router.push({ pathname: '/workout/finish', params: finishParams.current })
            },
          },
          // Leaving them out of a workout with nothing ticked saves nothing.
          ...(doneSets(workout) > 0
            ? [
                {
                  key: 'drop',
                  label: t('workouts:finish.dropThem'),
                  icon: { set: 'ui', name: 'checkbox-empty' } as const,
                  onPress: () =>
                    router.push({ pathname: '/workout/finish', params: finishParams.current }),
                },
              ]
            : []),
        ]}
      />

      <ConfirmSheet
        visible={nothing}
        onClose={() => setNothing(false)}
        title={t('workouts:finish.nothingTitle')}
        description={t('workouts:finish.nothingBody')}
        confirmLabel={t('workouts:logger.discardConfirm')}
        cancelLabel={t('common:action.keep')}
        onConfirm={discard}
      />

      {current ? (
        <StaleCheck
          startedAt={current.startedAt}
          answered={current.staleAnswered === true}
          onAnswered={() => dispatch({ type: 'staleAnswered' })}
          onFinish={finish}
          onDiscard={() => setConfirmDiscard(true)}
        />
      ) : null}
    </Screen>
  )
}

/**
 * The pieces that change every second, each with its own clock, so a tick
 * re-renders a figure rather than every card and cell in the logger.
 */
function Elapsed({ label, startedAt }: { label: string; startedAt: number }) {
  const now = useNow(1000)
  return <Stat label={label} value={workoutClock((now - startedAt) / 1000)} />
}

function RestCountdown(props: Omit<Parameters<typeof RestBar>[0], 'now'>) {
  const now = useNow(1000)
  return <RestBar {...props} now={now} />
}

/**
 * "Still training?", once the workout has run long enough to be a forgotten
 * one, and not again once it has been answered.
 */
type FinishParams = { endedAt?: string; pickEnd?: string }

function StaleCheck({
  startedAt,
  answered,
  onAnswered,
  onFinish,
  onDiscard,
}: {
  startedAt: number
  answered: boolean
  onAnswered: () => void
  onFinish: (params: FinishParams) => void
  onDiscard: () => void
}) {
  const now = useNow(60_000, !answered)
  const [closed, setClosed] = useState(false)
  const visible = !answered && !closed && now - startedAt > STALE_AFTER_MS
  return (
    <StaleWorkoutSheet
      visible={visible}
      onClose={() => setClosed(true)}
      onKeepGoing={onAnswered}
      onFinish={onFinish}
      onDiscard={onDiscard}
    />
  )
}

/** A component only so the hook can be switched on and off with the setting. */
function KeepAwake() {
  useKeepAwake('workout')
  return null
}
