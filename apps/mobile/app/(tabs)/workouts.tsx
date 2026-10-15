import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  type IconRef,
  summaryFromDocument,
  useOutbox,
  useRoutines,
  useSession,
  useSettings,
  useWorkoutOverview,
  useWorkouts,
} from '@/data'
import { ScreenTitle } from '@/features/shared'
import {
  awaitPick,
  defaultWorkoutName,
  OverviewCard,
  RoutineCard,
  routinePlans,
  useWorkoutStarter,
  WorkoutCard,
} from '@/features/workouts'
import { unitFor } from '@/lib/units'
import { Button, Card, Icon, IconButton, ListRow, Screen, Skeleton, Tappable, Text } from '@/ui'

/**
 * The Workouts tab: start one, start from a routine, and look back.
 *
 * Starting is the top of the screen because it is what the tab is for, and the
 * routines sit right under it because "start my push day" is the commonest way
 * in. The history follows, newest first, with anything still waiting to sync
 * at the top of it.
 */
/** Whether this launch's Live Activity resume has been answered. */
let resumedThisLaunch = false

export default function WorkoutsScreen() {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const { userId } = useSession()
  const { data: settings } = useSettings()
  const unit = unitFor(settings?.units)
  const overview = useWorkoutOverview()
  const routines = useRoutines()
  const workouts = useWorkouts()
  const outbox = useOutbox(userId)
  const starter = useWorkoutStarter()

  // `?resume=1` is a cold launch from the Live Activity (see
  // `app/+native-intent.tsx`): the logger is pushed from here, once this tab
  // has mounted, so the tabs are under it. Once per launch, because the param
  // stays on the route and coming back to the tab must not push it again.
  const { resume } = useLocalSearchParams<{ resume?: string }>()
  const running = starter.running
  useEffect(() => {
    if (!resume || resumedThisLaunch) return
    resumedThisLaunch = true
    if (running) router.push('/workout/active')
  }, [resume, running, router])

  const history = useMemo(() => {
    const saved = workouts.data?.pages.flat() ?? []
    const savedIds = new Set(saved.map((workout) => workout.id))
    const pending = outbox.filter((document) => !savedIds.has(document.id)).map(summaryFromDocument)
    return [...pending, ...saved]
  }, [workouts.data, outbox])

  const startSport = () => {
    awaitPick({
      single: true,
      deliver: ([plan]) => {
        if (plan)
          starter.start({ name: plan.name, source: 'empty', plans: [{ ...plan, sets: [{}] }] })
      },
    })
    router.push({ pathname: '/workout/exercises', params: { pick: 'one', category: 'sports' } })
  }

  return (
    <Screen>
      <ScreenTitle
        title={t('workouts:title')}
        trailing={
          <IconButton
            size="sm"
            variant="neutral"
            accessibilityLabel={t('workouts:settings.title')}
            onPress={() => router.push('/workout/settings')}
          >
            <Icon set="system" name="settings" size={22} />
          </IconButton>
        }
      />

      <OverviewCard
        overview={overview.data}
        unit={unit}
        loading={overview.isPending && !overview.isPaused}
      />

      {starter.running ? (
        <Button fullWidth size="lg" onPress={() => router.push('/workout/active')}>
          {t('workouts:start.resume')}
        </Button>
      ) : (
        <Button
          fullWidth
          size="lg"
          onPress={() => starter.start({ name: defaultWorkoutName(t), source: 'empty' })}
        >
          {t('workouts:start.empty')}
        </Button>
      )}

      <View className="flex-row gap-2.5">
        <QuickAction
          icon={<Icon set="body" name="badminton" size={30} />}
          label={t('workouts:start.sport')}
          onPress={startSport}
        />
        <QuickAction
          icon={<Icon set="system" name="calendar" size={30} />}
          label={t('workouts:start.past')}
          onPress={() => router.push({ pathname: '/workout/edit/[id]', params: { id: 'new' } })}
        />
      </View>

      <View className="flex-row items-center justify-between pt-2">
        <Text variant="subtitle">{t('workouts:routines.title')}</Text>
        <Button
          size="sm"
          variant="kaya"
          onPress={() => router.push({ pathname: '/workout/routine/[id]', params: { id: 'new' } })}
        >
          {t('workouts:routines.new')}
        </Button>
      </View>

      {/* Paused is offline with nothing cached: the request is held rather than
          failed, and a skeleton would wait for it forever. */}
      {routines.isPending && !routines.isPaused ? (
        <Skeleton className="h-[78px] w-full rounded-card" />
      ) : routines.data?.length ? (
        <View className="gap-stack">
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

      <Card contentClassName="gap-0 px-5 py-1">
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
            <WorkoutCard
              key={workout.id}
              workout={workout}
              unit={unit}
              onPress={
                workout.pending
                  ? undefined
                  : () => router.push({ pathname: '/workout/[id]', params: { id: workout.id } })
              }
            />
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

      {starter.sheet}
    </Screen>
  )
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode
  label: string
  onPress: () => void
}) {
  return (
    <Tappable
      className="flex-1 flex-row items-center gap-2.5 rounded-card border border-line bg-surface px-4 py-3"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon}
      <Text variant="label" className="flex-1" numberOfLines={2}>
        {label}
      </Text>
    </Tappable>
  )
}

/**
 * A list that could not be fetched, which is not an empty one: "No workouts
 * yet" over a history that simply did not load reads as a lost history.
 */
function Unavailable({ offline }: { offline: boolean }) {
  const { t } = useTranslation(['common'])
  return (
    <EmptyRow
      icon={offline ? { set: 'ui', name: 'offline' } : { set: 'ui', name: 'warning' }}
      title={offline ? t('common:offline.title') : t('common:offline.unreachableTitle')}
    />
  )
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
