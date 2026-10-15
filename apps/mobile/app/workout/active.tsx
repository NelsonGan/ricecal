import { useKeepAwake } from 'expo-keep-awake'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useSettings } from '@/data'
import {
  ActionSheet,
  discardWorkout,
  doneSets,
  liveTotals,
  RestBar,
  STALE_AFTER_MS,
  StaleWorkoutSheet,
  showsVolume,
  unfinishedSets,
  useLiveWorkout,
  useNow,
  useWorkoutPrefs,
  volume,
  WorkoutEditor,
  clock as workoutClock,
} from '@/features/workouts'
import { useBack } from '@/lib/navigation'
import { UNIT_KEY, unitFor } from '@/lib/units'
import { AppBar, Button, ConfirmSheet, EmptyState, Screen, Text } from '@/ui'

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
  const { userId, workout: current, dispatch } = useLiveWorkout()
  const { data: settings } = useSettings()
  const prefs = useWorkoutPrefs()
  const unit = unitFor(settings?.units)

  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [unfinished, setUnfinished] = useState(0)
  const [nothing, setNothing] = useState(false)

  // The last document seen, drawn while this screen leaves. Finishing and
  // discarding clear the workout and then navigate away, and in between the
  // screen re-renders with nothing; a <Redirect> there raced the navigation
  // and could mount the tabs a second time.
  const lastSeen = useRef(current)
  if (current) lastSeen.current = current
  const workout = current ?? lastSeen.current

  if (!workout) return <NothingRunning />

  const totals = liveTotals(workout)

  const finish = () => {
    if (doneSets(workout) === 0) {
      setNothing(true)
      return
    }
    const open = unfinishedSets(workout)
    if (open > 0) {
      setUnfinished(open)
      return
    }
    router.push('/workout/finish')
  }

  const discard = async () => {
    if (userId) discardWorkout(userId, workout)
    router.dismissTo('/workouts')
  }

  return (
    <Screen
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
            <Button size="sm" onPress={finish}>
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

      <View className="flex-row rounded-card bg-surface px-4 py-3">
        <Elapsed label={t('workouts:logger.duration')} startedAt={workout.startedAt} />
        {showsVolume(workout.exercises.map((exercise) => exercise.tracking)) ? (
          <Stat
            label={t('workouts:logger.volume')}
            value={`${volume(totals.volumeKg, unit)} ${t(UNIT_KEY[unit])}`}
          />
        ) : null}
        <Stat label={t('workouts:logger.sets')} value={String(totals.done)} />
      </View>

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
            onPress: () => router.push({ pathname: '/workout/finish', params: { complete: '1' } }),
          },
          {
            key: 'drop',
            label: t('workouts:finish.dropThem'),
            icon: { set: 'ui', name: 'checkbox-empty' },
            onPress: () => router.push('/workout/finish'),
          },
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
        />
      ) : null}
    </Screen>
  )
}

/**
 * Opened with no workout at all: a notice tapped after the workout it was
 * about had been finished. A screen that says so, not a redirect.
 */
function NothingRunning() {
  const { t } = useTranslation(['workouts', 'common'])
  const goBack = useBack('/workouts')
  return (
    <Screen header={<AppBar onBack={goBack} backLabel={t('common:action.back')} />}>
      <EmptyState title={t('workouts:detail.missing')} icon={{ set: 'body', name: 'stopwatch' }} />
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
function StaleCheck({
  startedAt,
  answered,
  onAnswered,
}: {
  startedAt: number
  answered: boolean
  onAnswered: () => void
}) {
  const now = useNow(60_000, !answered)
  const [closed, setClosed] = useState(false)
  const visible = !answered && !closed && now - startedAt > STALE_AFTER_MS
  return (
    <StaleWorkoutSheet visible={visible} onClose={() => setClosed(true)} onKeepGoing={onAnswered} />
  )
}

/** A component only so the hook can be switched on and off with the setting. */
function KeepAwake() {
  useKeepAwake('workout')
  return null
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 gap-0.5">
      <Text variant="overlineSm">{label}</Text>
      <Text variant="numeric" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  )
}
