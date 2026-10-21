import { format, parseISO } from 'date-fns'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import {
  discardQueuedWorkout,
  type IconRef,
  retryQueuedWorkout,
  summaryFromDocument,
  today,
  useCurrentWeight,
  useOutbox,
  useRoutines,
  useSession,
  useSettings,
  useWorkoutOverview,
  useWorkouts,
  useWorkoutsOn,
  type WorkoutSummary,
} from '@/data'
import type { WorkoutDocument } from '@/data/workout-outbox'
import { ScreenTitle } from '@/features/shared'
import {
  ActionSheet,
  DiscardDialog,
  defaultWorkoutName,
  NOT_LOADED,
  openLogger,
  RoutineCard,
  routinePlans,
  useRoutineGate,
  useWorkoutStarter,
  WeekStreakBadge,
  WorkoutCalendar,
  WorkoutCard,
} from '@/features/workouts'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { unitFor, type WeightUnit } from '@/lib/units'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Card, Icon, IconButton, ListRow, Screen, Skeleton, Text } from '@/ui'

/** Whether this launch's Live Activity resume has been answered. */
let resumedThisLaunch = false

/**
 * The Workouts tab: start one, start from a routine, and look back.
 *
 * Starting is the top of the screen because it is what the tab is for, and the
 * routines sit right under it because "start my push day" is the commonest way
 * in. The history follows, newest first, with anything still waiting to sync
 * at the top of it. The week's figures are on the progress page; only the
 * streak stays here, beside the title.
 */
export default function WorkoutsScreen() {
  const { t } = useTranslation(['workouts', 'common', 'logging'])
  const router = useRouter()
  const back = useBack('/today')
  const colors = useThemeColors()
  const { userId } = useSession()
  const { data: settings } = useSettings()
  const unit = unitFor(settings?.units)
  const overview = useWorkoutOverview()
  const routines = useRoutines()
  const workouts = useWorkouts()
  const outbox = useOutbox(userId)
  const bodyKg = useCurrentWeight()
  const starter = useWorkoutStarter()
  const routineGate = useRoutineGate()
  // The month instead of the tab, as Today's toggle swaps its day for one, and
  // the day picked in it. Today until another is tapped.
  const [calendar, setCalendar] = useState(false)
  const [day, setDay] = useState(today)
  // A workout still on the phone, tapped: it has no page yet, so a sheet
  // offers to send it again or to drop it.
  const [queued, setQueued] = useState<{ id: string; name: string } | null>(null)
  const [discarding, setDiscarding] = useState<{ id: string; name: string } | null>(null)

  // `?resume=1` is a cold launch from the Live Activity (see
  // `app/+native-intent.tsx`): the logger is pushed from here, once this tab
  // has mounted, so the tabs are under it. Once per launch, because the param
  // stays on the route and coming back to the tab must not push it again.
  const { resume } = useLocalSearchParams<{ resume?: string }>()
  const running = starter.running
  useEffect(() => {
    if (!resume || resumedThisLaunch) return
    resumedThisLaunch = true
    if (running) openLogger(router)
  }, [resume, running, router])

  // Stable, so the memoised cards only re-render when their own workout does.
  const openWorkout = useCallback(
    (workout: WorkoutSummary) => {
      if (workout.pending) setQueued({ id: workout.id, name: workout.name })
      else router.push({ pathname: '/workout/[id]', params: { id: workout.id } })
    },
    [router],
  )

  const history = useMemo(() => {
    const saved = workouts.data?.pages.flat() ?? []
    const savedIds = new Set(saved.map((workout) => workout.id))
    const pending = outbox
      .filter((document) => !savedIds.has(document.id))
      .map((document) => summaryFromDocument(document, bodyKg))
    return [...pending, ...saved]
  }, [workouts.data, outbox, bodyKg])

  return (
    <Screen>
      <ScreenTitle
        title={t('workouts:title')}
        leading={
          // A page now rather than a tab (Today and Me open it), so it starts
          // with the way back, then the list/calendar toggle beside the title.
          <View className="flex-row items-center gap-2">
            <IconButton
              size="xs"
              hitSlop={3}
              variant="ghost"
              onPress={back}
              accessibilityLabel={t('common:action.back')}
            >
              <Icon set="ui" name="chevron-left" size={20} tintColor={colors.muted} />
            </IconButton>
            <IconButton
              size="xs"
              hitSlop={3}
              onPress={() => setCalendar(!calendar)}
              accessibilityLabel={t(
                calendar ? 'workouts:calendar.showList' : 'logging:calendar.showMonth',
              )}
            >
              <Icon set="ui" name={calendar ? 'list-view' : 'calendar-view'} size={19} />
            </IconButton>
          </View>
        }
        trailing={<WeekStreakBadge weeks={overview.data?.weekStreak} />}
      />

      {calendar ? (
        <CalendarView day={day} onDay={setDay} unit={unit} outbox={outbox} onOpen={openWorkout} />
      ) : (
        <>
          {/* Medium rather than large: it is the first thing on the tab, and the
            routines under it start a workout just as well. */}
          {starter.running ? (
            <Button fullWidth onPress={() => openLogger(router)}>
              {t('workouts:start.resume')}
            </Button>
          ) : (
            <Button
              fullWidth
              onPress={() => starter.start({ name: defaultWorkoutName(t), source: 'empty' })}
            >
              {t('workouts:start.empty')}
            </Button>
          )}

          <Text variant="subtitle" className="pt-2">
            {t('workouts:routines.title')}
          </Text>

          {/* Paused is offline with nothing cached: the request is held rather than
            failed, and a skeleton would wait for it forever. */}
          {routines.isPending && !routines.isPaused ? (
            <Skeleton className="h-[78px] w-full rounded-card" />
          ) : routines.data?.length ? (
            // Closer than the cards elsewhere: a list of routines is one list.
            <View className="gap-2">
              {routines.data.map((routine) => (
                <RoutineCard
                  key={routine.id}
                  routine={routine}
                  onOpen={() =>
                    router.push({ pathname: '/workout/routine/[id]', params: { id: routine.id } })
                  }
                  onStart={() =>
                    starter.start({
                      name: routine.name,
                      source: 'routine',
                      routineId: routine.id,
                      plans: routinePlans(routine),
                    })
                  }
                />
              ))}
            </View>
          ) : !routines.data && (routines.isPaused || routines.isError) ? (
            <Unavailable offline={routines.isPaused} />
          ) : (
            <EmptyRow
              icon={{ set: 'system', name: 'guide-book' }}
              title={t('workouts:routines.emptyTitle')}
            />
          )}

          {/* A new routine is one more way into the plans, so it heads the list
            rather than riding opposite "My routines" as a second accent button. */}
          <Card contentClassName="gap-0 px-5 py-1">
            <ListRow
              title={t('workouts:routines.newTitle')}
              leading={<Icon set="system" name="guide-book" size={28} />}
              onPress={() => {
                if (!routineGate.allowNew()) return
                router.push({ pathname: '/workout/routine/[id]', params: { id: 'new' } })
              }}
            />
            <ListRow
              title={t('workouts:explore.title')}
              leading={<Icon set="system" name="rocket" size={28} />}
              onPress={() => router.push('/workout/templates')}
            />
            <ListRow
              title={t('workouts:stats.entry')}
              leading={<Icon set="system" name="trophy" size={28} />}
              onPress={() => router.push('/workout/stats')}
            />
            <ListRow
              title={t('workouts:library.title')}
              leading={<Icon set="body" name="gym-bench" size={28} />}
              onPress={() => router.push('/workout/exercises')}
            />
            {/* A row rather than a gear beside the title, which left the streak
              pill and a button competing for the title's line. Me's settings
              list has the same row. */}
            <ListRow
              title={t('workouts:settings.title')}
              leading={<Icon set="system" name="settings" size={28} />}
              onPress={() => router.push('/workout/settings')}
              divider={false}
            />
          </Card>

          <Text variant="subtitle" className="pt-2">
            {t('workouts:history.title')}
          </Text>

          {workouts.isPending && !workouts.isPaused && !history.length ? (
            <Card>
              <Skeleton className="h-[120px] w-full" />
            </Card>
          ) : history.length ? (
            <View className="gap-stack">
              {history.map((workout) => (
                <WorkoutCard key={workout.id} workout={workout} unit={unit} onPress={openWorkout} />
              ))}
              {workouts.hasNextPage ? (
                <Button
                  variant="neutral"
                  fullWidth
                  loading={workouts.isFetchingNextPage}
                  onPress={() => workouts.fetchNextPage()}
                >
                  {t('workouts:history.more')}
                </Button>
              ) : null}
            </View>
          ) : !workouts.data && (workouts.isPaused || workouts.isError) ? (
            <Unavailable offline={workouts.isPaused} />
          ) : (
            <EmptyRow
              icon={{ set: 'body', name: 'stopwatch' }}
              title={t('workouts:history.emptyTitle')}
            />
          )}
        </>
      )}

      {starter.dialog}

      <ActionSheet
        visible={queued !== null}
        onClose={() => setQueued(null)}
        title={queued?.name}
        description={t('workouts:history.pending')}
        actions={
          queued
            ? [
                {
                  key: 'retry',
                  label: t('common:action.retry'),
                  icon: { set: 'ui', name: 'refresh' },
                  onPress: () => retryQueuedWorkout(queued.id),
                },
                {
                  key: 'discard',
                  label: t('workouts:logger.discard'),
                  icon: { set: 'ui', name: 'delete' },
                  tone: 'danger',
                  onPress: () => setDiscarding(queued),
                },
              ]
            : []
        }
      />

      <DiscardDialog
        visible={discarding !== null}
        onClose={() => setDiscarding(null)}
        onDiscard={() => {
          if (userId && discarding) void discardQueuedWorkout(userId, discarding.id)
        }}
      />
    </Screen>
  )
}

/**
 * The calendar view: the month with every trained day filled, and under it
 * what was done on the day tapped. A workout opens its page as it does from the
 * history.
 */
function CalendarView({
  day,
  onDay,
  unit,
  outbox,
  onOpen,
}: {
  day: string
  onDay: (date: string) => void
  unit: WeightUnit
  outbox: readonly WorkoutDocument[]
  onOpen: (workout: WorkoutSummary) => void
}) {
  const { t } = useTranslation(['workouts'])
  const bodyKg = useCurrentWeight()
  // With records, so a card here carries the same PR badge it has in History.
  const saved = useWorkoutsOn(day, { records: true })
  // And the day's workouts still on the phone, as History lists them, or one
  // finished offline is missing from its own day.
  const list = useMemo(() => {
    const rows = saved.data ?? []
    const ids = new Set(rows.map((workout) => workout.id))
    const pending = outbox
      .filter((document) => document.log_date === day && !ids.has(document.id))
      .map((document) => summaryFromDocument(document, bodyKg))
    return [...pending, ...rows]
  }, [saved.data, outbox, day, bodyKg])

  return (
    <>
      <WorkoutCalendar selected={day} onSelect={onDay} />
      <Text variant="subtitle" className="pt-2">
        {format(parseISO(day), datePattern('weekdayDayMonthLong'))}
      </Text>
      {list.length ? (
        <View className="gap-stack">
          {list.map((workout) => (
            <WorkoutCard key={workout.id} workout={workout} unit={unit} onPress={onOpen} />
          ))}
        </View>
      ) : saved.isPending && !saved.isPaused ? (
        <Card>
          <Skeleton className="h-[120px] w-full" />
        </Card>
      ) : !saved.data ? (
        <Unavailable offline={saved.isPaused} />
      ) : (
        <EmptyRow
          icon={{ set: 'body', name: 'stopwatch' }}
          title={t('workouts:calendar.dayEmpty')}
        />
      )}
    </>
  )
}

/**
 * A list that could not be fetched, which is not an empty one: "No workouts
 * yet" over a history that simply did not load reads as a lost history.
 */
function Unavailable({ offline }: { offline: boolean }) {
  const { t } = useTranslation(['common'])
  const reason = NOT_LOADED[offline ? 'offline' : 'unreachable']
  return <EmptyRow icon={reason.icon} title={t(reason.title)} />
}

/** An empty list as one quiet row rather than a card-sized illustration. */
function EmptyRow({ icon, title }: { icon: IconRef; title: string }) {
  return (
    <Card contentClassName="flex-row items-center gap-3 px-5 py-4">
      <Icon {...icon} size={36} />
      <Text variant="meta" className="flex-1">
        {title}
      </Text>
    </Card>
  )
}
