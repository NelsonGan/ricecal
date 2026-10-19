import { useKeepAwake } from 'expo-keep-awake'
import { useIsFocused, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useLastSets, useSettings } from '@/data'
import {
  burnNote,
  completeAll,
  DiscardDialog,
  discardWorkout,
  doneSets,
  type FinishParams,
  getActiveWorkout,
  LiveHeart,
  type LiveWorkout,
  liveTotals,
  RestBar,
  StaleWorkoutDialog,
  Stat,
  showsVolume,
  unfinishedSets,
  useEnergyBody,
  useLiveWorkout,
  useLoggerOpen,
  useNow,
  useWatchEnergy,
  useWatchPulse,
  useWatchPulsing,
  useWorkoutPrefs,
  volumeText,
  WorkoutEditor,
  WorkoutUnavailable,
  workoutBurn,
  clock as workoutClock,
} from '@/features/workouts'
import { unitFor } from '@/lib/units'
import { AppBar, Button, Dialog, Screen, Text, useHeld } from '@/ui'

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
  // The logger's own Discard, or a finish with nothing to save.
  const [discarding, setDiscarding] = useState<'discard' | 'nothing' | null>(null)
  const [unfinished, setUnfinished] = useState(0)
  const finishParams = useRef<FinishParams>({})
  // Under the finish screen, the library or an exercise's page this stays
  // mounted, and "Still training?" asked from there over whatever was on top.
  const focused = useIsFocused()

  // The last document seen, drawn while this screen leaves. Finishing and
  // discarding clear the workout and then navigate away, and in between the
  // screen re-renders with nothing; a <Redirect> there raced the navigation
  // and could mount the tabs a second time.
  const workout = useHeld(current, Boolean(current))
  // Whether the heart rate takes a place along the foot of the figures.
  const pulsing = useWatchPulsing(workout?.id)
  // Last time's sets, for what an unticked set offers. The editor asks for
  // the same key, so this reads its cache.
  const previous = useLastSets(workout?.exercises.map((exercise) => exercise.exerciseId) ?? []).data

  // A notice tapped after its workout was finished: say so, rather than redirect.
  if (!workout) return <WorkoutUnavailable />

  const totals = liveTotals(workout)

  // Sets showing numbers but not ticked are asked about, even when none are
  // ticked: a workout logged by typing and never ticking is the commonest
  // way to finish with "nothing to save".
  // `params` carries what "Still training?" chose (the last set's time, or
  // picking one) through the same checks to the save screen.
  const commitName = () => {
    setRenaming(false)
    if (name.trim()) dispatch({ type: 'rename', name: name.trim() })
  }

  const finish = (params: FinishParams = {}) => {
    // A name still being typed is saved first: it is only committed when the
    // field closes, and the save screen reads the workout as it opens.
    if (renaming) commitName()
    finishParams.current = params
    const open = unfinishedSets(workout, previous)
    if (open > 0) {
      setUnfinished(open)
      return
    }
    if (doneSets(workout) === 0) {
      setDiscarding('nothing')
      return
    }
    router.push({ pathname: '/workout/finish', params })
  }

  const discard = () => {
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
                  onDone: commitName,
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

      {/* One card for the figures: the clock leads because it ticks, the
          training figures beside it, and what the body did (a watch's heart
          rate, the burn) in a band along the foot. Five figures in one strip
          cut every label off; stacked, they took a third of the screen. */}
      <View className="overflow-hidden rounded-card bg-surface">
        <View className="flex-row px-4 py-3">
          <View className="pr-4">
            <Elapsed label={t('workouts:logger.duration')} startedAt={workout.startedAt} />
          </View>
          {showsVolume(workout.exercises.map((exercise) => exercise.tracking)) ? (
            <View className="flex-1 border-line border-l px-3">
              <Stat
                label={t('workouts:logger.volume')}
                value={volumeText(t, totals.volumeKg, unit)}
              />
            </View>
          ) : null}
          <View className="flex-1 border-line border-l pl-3">
            <Stat label={t('workouts:logger.sets')} value={String(totals.done)} />
          </View>
        </View>
        <View className="flex-row bg-pandan-soft px-4 py-2.5">
          {pulsing ? (
            <View className="pr-3" style={HALF}>
              <WatchPulse workoutId={workout.id} />
            </View>
          ) : null}
          <View className={pulsing ? 'border-pandan/20 border-l pl-3' : undefined} style={HALF}>
            <LiveBurn workout={workout} />
          </View>
        </View>
      </View>

      <WorkoutEditor workout={workout} dispatch={dispatch} mode="live" />

      <Button variant="ghost" fullWidth onPress={() => setDiscarding('discard')}>
        {t('workouts:logger.discard')}
      </Button>

      <DiscardDialog
        visible={discarding !== null}
        nothing={discarding === 'nothing'}
        onClose={() => setDiscarding(null)}
        onDiscard={discard}
      />

      {/* Numbers typed into a set but never ticked: ask, rather than guess.
          Cancel is the third answer, "not yet". */}
      <Dialog
        visible={unfinished > 0}
        onClose={() => setUnfinished(0)}
        title={t('workouts:finish.unfinishedTitle')}
        description={t('workouts:finish.unfinishedBody', { count: unfinished })}
        cancelLabel={t('common:action.cancel')}
        actions={[
          {
            key: 'complete',
            label: t('workouts:finish.completeThem'),
            onPress: () => {
              // The stored document, not this render's: a lock-screen tick or a
              // rest ending before the dialog closed would otherwise be undone.
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
                  onPress: () =>
                    router.push({ pathname: '/workout/finish', params: finishParams.current }),
                },
              ]
            : []),
        ]}
      />

      {current && focused ? (
        <StaleWorkoutDialog
          workout={current}
          onKeepGoing={() => dispatch({ type: 'staleAnswered' })}
          onFinish={finish}
          onDiscard={() => setDiscarding('discard')}
        />
      ) : null}
    </Screen>
  )
}

/**
 * The pieces that change every second, each with its own clock, so each
 * second re-renders one figure rather than every card and cell in the logger.
 */
function Elapsed({ label, startedAt }: { label: string; startedAt: number }) {
  const now = useNow(1000)
  return (
    <View className="gap-0.5">
      <Text variant="overlineSm">{label}</Text>
      <Text variant="displayMd" numberOfLines={1} style={TABULAR}>
        {workoutClock((now - startedAt) / 1000)}
      </Text>
    </View>
  )
}

/** One of two equal columns along the foot of the figures card. */
const HALF = { flex: 1, flexBasis: 0 }

/** Digits that keep their width, so the clock does not shuffle each second. */
const TABULAR = { fontVariant: ['tabular-nums' as const] }

/** The heart rate an Apple Watch recording this workout is streaming, while it is. */
function WatchPulse({ workoutId }: { workoutId: string }) {
  const { t } = useTranslation(['activity'])
  const bpm = useWatchPulse(workoutId)
  if (bpm === null) return null
  return (
    <Stat
      label={t('activity:workout.heartRate')}
      value={t('activity:workout.bpm', { value: bpm })}
      leading={<LiveHeart bpm={bpm} />}
    />
  )
}

/**
 * The energy the workout has burned so far: the Apple Watch's while it is
 * recording, our estimate otherwise (`workoutBurn`). Its own five second clock,
 * since an estimate moves slowly and a watch streams no faster.
 */
function LiveBurn({ workout }: { workout: LiveWorkout }) {
  const { t } = useTranslation(['workouts', 'common'])
  const now = useNow(5000)
  const body = useEnergyBody()
  const watchKcal = useWatchEnergy(workout.id)
  const burn = workoutBurn(workout, (now - workout.startedAt) / 1000, body, watchKcal)
  const note = burnNote(t, burn.source, body !== undefined)
  return (
    <Stat
      label={t('workouts:detail.kcalLabel')}
      value={
        burn.kcal === null ? '—' : t('workouts:detail.kcal', { value: burn.kcal.toLocaleString() })
      }
      info={note}
    />
  )
}

function RestCountdown(props: Omit<Parameters<typeof RestBar>[0], 'now'>) {
  const now = useNow(1000)
  return <RestBar {...props} now={now} />
}

/** A component only so the hook can be switched on and off with the setting. */
function KeepAwake() {
  useKeepAwake('workout')
  return null
}
