import { format, parseISO } from 'date-fns'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
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
import { AppBar, Button, Card, cn, Icon, ListRow, Screen, Skeleton, Tappable, Text } from '@/ui'

/**
 * The Workouts page: start one, start from a routine, and look back.
 *
 * Starting is the top of the screen because it is what the page is for, and the
 * routines sit right under it because "start my push day" is the commonest way
 * in. The history follows, newest first, with anything still waiting to sync
 * at the top of it. The week's figures are on the progress page; only the
 * streak stays here, beside the title.
 */
export default function WorkoutsScreen() {
  const { t } = useTranslation(['workouts', 'common', 'logging'])
  const router = useRouter()
  const back = useBack('/today')
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
  // The month instead of the list, as Today's toggle swaps its day for one, and
  // the day picked in it. Today until another is tapped.
  const [calendar, setCalendar] = useState(false)
  const [day, setDay] = useState(today)
  // A workout still on the phone, tapped: it has no page yet, so a sheet
  // offers to send it again or to drop it.
  const [queued, setQueued] = useState<{ id: string; name: string } | null>(null)
  const [discarding, setDiscarding] = useState<{ id: string; name: string } | null>(null)

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
    <Screen
      header={
        // A page now rather than a tab (Today and Me open it), so it has the
        // standard bar and its way back; the streak rides opposite.
        <AppBar
          title={t('workouts:title')}
          onBack={back}
          backLabel={t('common:action.back')}
          action={<WeekStreakBadge weeks={overview.data?.weekStreak} />}
        />
      }
    >
      {/* Medium rather than large: it is the first thing on the page, and the
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

      {/* The month is another way to read the history, so its toggle sits on
            the history's heading and swaps only that section. */}
      <View className="flex-row items-center justify-between pt-2">
        <Text variant="subtitle">{t('workouts:history.title')}</Text>
        <HistoryViewToggle calendar={calendar} onChange={setCalendar} />
      </View>

      {calendar ? (
        <CalendarView day={day} onDay={setDay} unit={unit} outbox={outbox} onOpen={openWorkout} />
      ) : workouts.isPending && !workouts.isPaused && !history.length ? (
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
 * List or month, as two icons in one small track with the current one raised.
 * Icons rather than words: the heading beside it already says what is listed.
 */
function HistoryViewToggle({
  calendar,
  onChange,
}: {
  calendar: boolean
  onChange: (calendar: boolean) => void
}) {
  const { t } = useTranslation(['workouts', 'logging'])
  const options = [
    { value: false, icon: 'list-view', label: t('workouts:calendar.showList') },
    { value: true, icon: 'calendar-view', label: t('logging:calendar.showMonth') },
  ] as const
  return (
    <View className="flex-row gap-1 rounded-full bg-track p-1" accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === calendar
        return (
          <Tappable
            key={option.icon}
            className={cn(
              'h-[30px] w-[38px] items-center justify-center rounded-full',
              selected && 'bg-surface',
            )}
            hitSlop={4}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
          >
            {/* Untinted, as the icons are drawn: a tint flattens them to a blob
              at this size. The one not showing is faded instead. */}
            <Icon set="ui" name={option.icon} size={18} style={{ opacity: selected ? 1 : 0.45 }} />
          </Tappable>
        )
      })}
    </View>
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
