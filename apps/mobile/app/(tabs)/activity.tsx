import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import {
  today as todayKey,
  useActivityDay,
  useActivitySessions,
  useActivitySummary,
  useConnectHealth,
  useDayLog,
  useHealthAutoSync,
  useHealthConnection,
  useSettings,
  useTargets,
} from '@/data'
import {
  BudgetStrip,
  ConnectPanel,
  count,
  type RingStat,
  RingTrio,
  SessionRow,
  syncedAgo,
} from '@/features/activity'
import { ScreenTitle } from '@/features/shared'
import { type Availability, canOfferDemo, offeredProviders, type ProviderId } from '@/lib/health'
import { sumMacros } from '@/lib/nutrition'
import { Badge, Button, Card, EmptyState, Icon, ListRow, Screen, Skeleton, Text } from '@/ui'

/**
 * A2 / N3: the Activity tab.
 *
 * Two screens in one route, and the split is on whether this account has ever
 * connected a health store rather than on whether it has data today. A user who
 * connected last week and left their watch at home gets the activity screen
 * with empty rings, not the sales pitch again.
 *
 * WHY THE SYNC IS MOUNTED HERE AND NOT IN THE TAB LAYOUT
 *
 * `useHealthAutoSync` needs a provider id, which comes from a query, and the
 * tab layout renders before the session is even resolved. It also only matters
 * on the screens that show movement — and this is the one people open. Today's
 * budget gets its refresh for free, because the sync invalidates the day.
 *
 * WHAT THE THIRD TILE IS
 *
 * Stand hours on Apple, steps on Android — decided here, because this is the
 * screen that knows both what the provider is and what the day actually holds.
 * `RingTrio` never learns which platform it is on.
 */
export default function ActivityScreen() {
  const { t } = useTranslation(['activity', 'common'])
  const router = useRouter()

  const date = todayKey()

  const connection = useHealthConnection()
  const provider = connection.data?.connected ? connection.data.provider : null

  const day = useActivityDay(date)
  const sessions = useActivitySessions(date)
  const summary = useActivitySummary('7d')
  const { data: targets } = useTargets()
  const { data: settings } = useSettings()
  const food = useDayLog(date)

  useHealthAutoSync(provider)

  // What the platform will allow, asked once on mount. State rather than a
  // query because it is a question about this device, not about this account —
  // it has no cache key that would mean anything and nothing invalidates it but
  // the user going to Settings and coming back.
  const [availability, setAvailability] = useState<Availability | null>(null)

  const check = useCallback(() => {
    offeredProviders().then(({ native }) => setAvailability(native.availability))
  }, [])

  useEffect(check, [check])

  const connect = useConnectHealth()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [cameBackEmpty, setCameBackEmpty] = useState(false)

  const onConnect = (id: ProviderId) => {
    setCameBackEmpty(false)
    setProgress(null)
    connect.mutate(
      { provider: id, onProgress: setProgress },
      {
        // Zero days after a granted-looking connect is the only signal iOS
        // gives that the read was refused. See `apple.ts`.
        onSuccess: (result) => setCameBackEmpty(result.granted && result.days === 0),
      },
    )
  }

  if (connection.isPending) {
    return (
      <Screen>
        <ScreenTitle title={t('activity:title')} />
        <Card>
          <Skeleton className="h-[180px] w-full" />
        </Card>
      </Screen>
    )
  }

  if (!provider) {
    return (
      <Screen>
        <ScreenTitle title={t('activity:title')} />
        <ConnectPanel
          availability={availability ?? { ok: false, reason: 'wrong-platform' }}
          demo={canOfferDemo(availability ?? { ok: true }, cameBackEmpty)}
          busy={connect.isPending}
          progress={progress}
          cameBackEmpty={cameBackEmpty}
          onConnect={onConnect}
          onRecheck={check}
        />
      </Screen>
    )
  }

  const activity = day.data
  const synced = syncedAgo(connection.data?.lastSyncedAt ?? null)
  const eaten = sumMacros(food.entries).kcal

  const stats: RingStat[] = [
    {
      key: 'move',
      label: t('activity:today.move'),
      value: count(activity?.activeKcal ?? 0),
      unit: activity?.moveGoalKcal
        ? t('activity:today.moveUnit', { goal: count(activity.moveGoalKcal) })
        : t('activity:today.noGoal'),
      progress: activity?.moveGoalKcal ? (activity.activeKcal ?? 0) / activity.moveGoalKcal : null,
      tone: 'hibiscus',
      icon: { set: 'body', name: 'flame-burn' },
    },
    {
      key: 'exercise',
      label: t('activity:today.exercise'),
      // A dash, not a zero, when the store reported nothing.
      //
      // `exercise_minutes` is nullable precisely so this distinction survives
      // the database, and rendering `?? 0` here threw it away at the last step:
      // a Health store with steps and energy but no exercise minutes drew a
      // confident "0 min", which is a claim about the user's day rather than
      // about what the provider measured. Active energy and steps ARE non-null
      // columns, so they keep their zero — a day with no steps really is a day
      // of no steps.
      value:
        activity?.exerciseMinutes == null
          ? t('activity:today.none')
          : count(activity.exerciseMinutes),
      unit: activity?.exerciseGoalMin
        ? t('activity:today.exerciseUnit', { goal: activity.exerciseGoalMin })
        : t('activity:today.noGoalMinutes'),
      progress: activity?.exerciseGoalMin
        ? (activity.exerciseMinutes ?? 0) / activity.exerciseGoalMin
        : null,
      tone: 'pandan',
      icon: { set: 'body', name: 'stopwatch' },
    },
    // The tile that differs by platform. Stand hours where the store reports
    // them; steps where it never will, which is every Android phone.
    activity?.standHours != null
      ? {
          key: 'stand',
          label: t('activity:today.stand'),
          value: count(activity.standHours),
          unit: activity.standGoalHr
            ? t('activity:today.standUnit', { goal: activity.standGoalHr })
            : t('activity:today.noGoalHours'),
          progress: activity.standGoalHr ? activity.standHours / activity.standGoalHr : null,
          tone: 'water',
          icon: { set: 'body', name: 'stairs' },
        }
      : {
          key: 'steps',
          label: t('activity:today.stepsRing'),
          value: count(activity?.steps ?? 0),
          // Compact, because this unit shares a row with a five-character
          // figure in a tile a third of a phone wide: "4,820" beside
          // "/ 8,000" ellipsised to "/ 8,...", which is worse than no target
          // at all. "8k" is the same target in two characters.
          unit: t('activity:today.stepsUnit', {
            goal: compactSteps(summary.data?.stepGoal ?? 8000),
          }),
          progress: summary.data?.stepGoal ? (activity?.steps ?? 0) / summary.data.stepGoal : null,
          tone: 'water',
          icon: { set: 'body', name: 'footprints' },
        },
  ]

  const balance = summary.data?.balance ?? null

  return (
    <Screen>
      <ScreenTitle
        title={t('activity:title')}
        trailing={
          <Badge tone={provider === 'demo' ? 'kaya' : 'neutral'}>
            <Icon set="system" name="sync" size={16} />
            <Text variant="caption" className={provider === 'demo' ? 'text-kaya-ink' : ''}>
              {provider === 'demo'
                ? t('activity:today.demoBadge')
                : t(`activity:today.${synced.key}`, { count: synced.count })}
            </Text>
          </Badge>
        }
      />

      {day.isPending ? (
        <Card>
          <Skeleton className="h-[92px] w-full" />
        </Card>
      ) : (
        <RingTrio stats={stats} />
      )}

      {/* The third tile said "Steps" rather than "Stand", so say why. Only when
          a provider that could have reported it did not — a day the watch was
          simply off is not the same claim. */}
      {activity && activity.standHours == null && provider === 'health_connect' ? (
        <Text variant="meta">{t('activity:today.noStandNoteGeneric')}</Text>
      ) : null}

      <Card>
        <BudgetStrip
          goal={targets?.kcal ?? 0}
          eaten={eaten}
          burned={activity?.activeKcal ?? 0}
          extends={settings?.activity_extends_budget ?? true}
        />
      </Card>

      <Card title={t('activity:today.todayTitle')} flush>
        <View className="px-7">
          <ListRow
            title={t('activity:today.stepsRow')}
            subtitle={t('activity:today.stepsRowValue', { steps: count(activity?.steps ?? 0) })}
            leading={<Icon set="body" name="footprints" size={32} />}
            onPress={() => router.push('/activity/steps')}
          />
          <ListRow
            title={t('activity:today.balanceRow')}
            subtitle={
              balance == null
                ? t('activity:today.balanceUnknown')
                : balance < 0
                  ? t('activity:today.balanceDeficit', { value: count(Math.abs(balance)) })
                  : t('activity:today.balanceSurplus', { value: count(balance) })
            }
            leading={<Icon set="body" name="pulse-wave" size={32} />}
            onPress={() => router.push('/activity/balance')}
          />
          <ListRow
            title={t('activity:history.title')}
            subtitle={t('activity:history.sessions').toLowerCase()}
            leading={<Icon set="system" name="calendar" size={32} />}
            onPress={() => router.push('/activity/history')}
            divider={sessions.data ? sessions.data.length > 0 : false}
          />

          {sessions.data?.map((session, index) => (
            <SessionRow
              key={session.id}
              session={session}
              divider={index < (sessions.data?.length ?? 0) - 1}
              onPress={() =>
                router.push({
                  pathname: '/activity/workout/[id]',
                  params: { id: session.id },
                })
              }
            />
          ))}
        </View>
      </Card>

      {sessions.data && sessions.data.length === 0 ? (
        <EmptyState
          title={t('activity:today.noSessionsTitle')}
          description={t('activity:today.noSessionsBody')}
          icon={{ set: 'body', name: 'running-shoe' }}
        />
      ) : null}

      {/* A connected store that has never had anything in it.
          This is the simulator: an iOS 26 simulator reports HealthKit as
          available and shows the real permission sheet, then reads a year and
          returns nothing, because there is no Health data on it. The offer
          therefore has to live here rather than on the connect screen — by the
          time we know the store is empty, the account is already connected and
          that screen is gone.

          Development builds only, so nothing here can reach a released app. */}
      {__DEV__ && provider !== 'demo' && summary.data?.activeDays === 0 ? (
        <Card tone="kaya">
          <View className="gap-3">
            <Text variant="body" className="text-kaya-ink">
              {t('activity:today.storeEmpty')}
            </Text>
            <Button
              variant="secondary"
              fullWidth
              loading={connect.isPending}
              disabled={connect.isPending}
              onPress={() => onConnect('demo')}
            >
              {t('activity:connect.demo')}
            </Button>
          </View>
        </Card>
      ) : null}
    </Screen>
  )
}

/**
 * A step goal as "8k" / "12.5k".
 *
 * Only for the ring tile, where the full figure does not fit beside the count.
 * Everywhere with room — the steps screen's "Goal 8,000 steps" — prints it in
 * full, because a goal is a number somebody chose and they should see it.
 */
function compactSteps(goal: number): string {
  const thousands = goal / 1000
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`
}
