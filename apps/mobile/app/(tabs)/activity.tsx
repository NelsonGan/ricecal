import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshControl, View } from 'react-native'
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
  duration,
  type RingStat,
  RingTrio,
  SessionRow,
  syncedAgo,
} from '@/features/activity'
import { ScreenTitle } from '@/features/shared'
import { type Availability, canOfferDemo, offeredProviders, type ProviderId } from '@/lib/health'
import { sumMacros } from '@/lib/nutrition'
import { useThemeColors } from '@/theme/useTheme'
import { Badge, Button, Card, Icon, ListRow, Screen, Skeleton, Text } from '@/ui'

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
 * Stand hours where the store reports them, steps where it never will — decided
 * here, because this is the screen that knows what the provider is. `RingTrio`
 * never learns which platform it is on.
 *
 * It is keyed on the PROVIDER and not on today's value. Keying it on
 * `standHours != null` looked equivalent and is not: Apple has plenty of days
 * with no stand figure, and every day has no stand figure at 7am. The tile
 * therefore changed from Steps to Stand partway through a morning, and back
 * again on a day the watch was off — a column of the same layout measuring
 * something different each time you looked. A provider that reports stand hours
 * owns that tile whether or not it has an answer today; the em dash is what it
 * says when it does not.
 *
 * WHAT THE BARS ARE MEASURED AGAINST
 *
 * A provider's own ring goal when it gives one, and the user's 7-day average
 * when it does not. The second case is not an edge: HealthKit's ring goals live
 * on `HKActivitySummary`, which our library does not bind, so on iOS there is
 * NEVER a goal and all three tiles used to draw an empty grey track for the
 * lifetime of the app. An empty track next to a number reads as "you are at
 * zero", which was wrong every time.
 *
 * The average is honest — the user's own recent days, already computed by
 * `activity_summary` for the tiles further down — and it makes the bar answer
 * the question the tile is actually asked: is today a normal day?
 */
export default function ActivityScreen() {
  const { t } = useTranslation(['activity', 'common'])
  const router = useRouter()
  const colors = useThemeColors()

  const date = todayKey()

  const connection = useHealthConnection()
  const provider = connection.data?.connected ? connection.data.provider : null

  const day = useActivityDay(date)
  const sessions = useActivitySessions(date)
  const summary = useActivitySummary('7d')
  const targets = useTargets()
  const { data: settings } = useSettings()
  const food = useDayLog(date)

  // `syncNow` forces a pass past the throttle, which is exactly what a deliberate
  // pull means: the automatic one already ran on mount and on the last
  // foreground, so an unforced call would spin and do nothing.
  const { syncNow, isSyncing, isBusy } = useHealthAutoSync(provider)

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

  /**
   * The body of the screen waits as one, for the reason Today's does.
   *
   * Every figure here falls back to zero or to a dash, and four of the five
   * queries behind them are separate requests that land in whatever order the
   * network decides. Gated one at a time the screen assembled itself in front
   * of the reader: rings at zero, a budget strip claiming the whole allowance
   * was still there, "No workouts this week" over a week with three in it.
   *
   * The rings in particular are gated on the SUMMARY as well as on the day,
   * because the summary is where a tile's reference figure comes from when the
   * provider gives no goal — see `against` below. Without it the bars drew
   * against nothing and then jumped to an average.
   */
  const loading =
    day.isPending || sessions.isPending || summary.isPending || food.isPending || targets.isPending

  /**
   * A tile's reference figure: the store's goal, else the user's own average.
   *
   * Returned as a pair so the caller writes the unit and the bar from one
   * decision — they were two conditionals over the same question before, and the
   * bar could disagree with the line above it.
   */
  const against = (
    value: number | null,
    goal: number | null,
    average: number | null,
    unitKey: 'moveUnit' | 'exerciseUnit' | 'standUnit',
    bareUnitKey: 'noGoal' | 'noGoalMinutes' | 'noGoalHours',
  ): Pick<RingStat, 'unit' | 'progress'> => {
    if (goal) {
      return {
        unit: t(`activity:today.${unitKey}`, { goal: count(goal) }),
        progress: value == null ? null : value / goal,
      }
    }

    // "/ 326 avg" rather than "kcal · avg 326". The tile is a third of a phone
    // wide and its own comment records what happens to a long unit there — the
    // steps tile already drops the word "steps" to fit "/ 8k". A slash and a
    // reference is the grammar this row reads in, and the label above supplies
    // the quantity.
    if (average != null && average > 0) {
      return {
        unit: t('activity:today.avgUnit', { value: count(average) }),
        progress: value == null ? null : value / average,
      }
    }

    // Neither. A connection made minutes ago, with no history to average and no
    // goal to draw — the one case where a bare unit and an empty track are the
    // honest answer rather than an oversight.
    return { unit: t(`activity:today.${bareUnitKey}`), progress: null }
  }

  const stats: RingStat[] = [
    {
      key: 'move',
      label: t('activity:today.move'),
      // A dash, not a zero, for the same reason as the exercise tile below —
      // and this one is the commoner case on Android. A store that reports
      // steps but no active energy is a Samsung phone with no watch on it, and
      // "0 kcal" beside 4,000 steps is the app calling the user still.
      value: activity?.activeKcal == null ? t('activity:today.none') : count(activity.activeKcal),
      ...against(
        activity?.activeKcal ?? null,
        activity?.moveGoalKcal ?? null,
        summary.data?.activeKcal ?? null,
        'moveUnit',
        'noGoal',
      ),
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
      ...against(
        activity?.exerciseMinutes ?? null,
        activity?.exerciseGoalMin ?? null,
        summary.data?.exerciseMinutes ?? null,
        'exerciseUnit',
        'noGoalMinutes',
      ),
      tone: 'pandan',
      icon: { set: 'body', name: 'stopwatch' },
    },
    // The tile that differs by platform. Health Connect has no stand-hour record
    // type at all, so on Android this is steps; everywhere else it is stand.
    provider === 'health_connect'
      ? {
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
        }
      : {
          key: 'stand',
          label: t('activity:today.stand'),
          value:
            activity?.standHours == null ? t('activity:today.none') : count(activity.standHours),
          ...against(
            activity?.standHours ?? null,
            activity?.standGoalHr ?? null,
            summary.data?.standHours ?? null,
            'standUnit',
            'noGoalHours',
          ),
          tone: 'water',
          icon: { set: 'body', name: 'stairs' },
        },
  ]

  const balance = summary.data?.balance ?? null
  const weekSessions = summary.data?.sessions ?? 0

  return (
    <Screen
      /**
       * The pull the freshness badge implies.
       *
       * `isSyncing` is the PULL, not every pass. A refreshing control holds the
       * whole scroll view pushed down under its spinner, and the automatic sync
       * runs on mount — so this tab opened with its header parked below the
       * notch and stayed there until the sync landed, which reads as a screen
       * stuck mid-swipe. An automatic pass reports itself in the badge instead.
       */
      refreshControl={
        <RefreshControl refreshing={isSyncing} onRefresh={syncNow} tintColor={colors.muted} />
      }
    >
      <ScreenTitle
        title={t('activity:title')}
        trailing={
          <Badge tone={provider === 'demo' ? 'kaya' : 'neutral'}>
            <Icon set="system" name="sync" size={16} />
            <Text variant="caption" className={provider === 'demo' ? 'text-kaya-ink' : ''}>
              {/* Syncing outranks the stamp, and only for a real store: on demo
                  data the badge names where the numbers came from, which is the
                  more important thing to say and does not stop being true for
                  the length of a pass. */}
              {provider === 'demo'
                ? t('activity:today.demoBadge')
                : isBusy
                  ? t('activity:today.syncing')
                  : t(`activity:today.${synced.key}`, { count: synced.count })}
            </Text>
          </Badge>
        }
      />

      {loading ? (
        <Card>
          <Skeleton className="h-[92px] w-full" />
        </Card>
      ) : (
        <RingTrio stats={stats} />
      )}

      {/* The third tile says "Steps" rather than "Stand", so say why. Only on
          the provider that will never report one — an Apple day with the watch
          on the charger shows a dash in a Stand tile, which explains itself. */}
      {provider === 'health_connect' ? (
        <Text variant="meta">{t('activity:today.noStandNoteGeneric')}</Text>
      ) : null}

      <Card>
        {loading ? (
          <Skeleton className="h-[76px] w-full" />
        ) : (
          <BudgetStrip
            goal={targets.data?.kcal ?? 0}
            eaten={eaten}
            burned={activity?.activeKcal ?? 0}
            extends={settings?.activity_extends_budget ?? true}
          />
        )}
      </Card>

      {/**
       // TWO CARDS, BECAUSE THERE ARE TWO TIMEFRAMES.
       //
       // Splitting them costs one more card and makes both headings true, which
       // is also what finally gives the History row something to say: the same
       // `activity_summary` the screen already has is where its count and its
       // time come from.
       */}
      <Card title={t('activity:today.todayTitle')} flush>
        <View className="px-7">
          {loading ? (
            <Skeleton className="h-[52px] w-full" />
          ) : (
            <>
              <ListRow
                title={t('activity:today.stepsRow')}
                subtitle={t('activity:today.stepsRowValue', { steps: count(activity?.steps ?? 0) })}
                leading={<Icon set="body" name="footprints" size={32} />}
                onPress={() => router.push('/activity/steps')}
                divider={(sessions.data?.length ?? 0) > 0}
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
            </>
          )}
        </View>
      </Card>

      {/* No "No workouts today" block. A day with nothing recorded on it is the
          normal state of this screen before the afternoon, and a card saying so
          is the app taking up a screenful to report that nothing has happened
          yet. The Today card above already shows the steps row on its own, and
          the week's count is one card below. */}

      <Card title={t('activity:today.weekTitle')} flush>
        <View className="px-7">
          {loading ? (
            <Skeleton className="h-[104px] w-full" />
          ) : (
            <>
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
                subtitle={
                  weekSessions === 0
                    ? t('activity:today.historyNone')
                    : t('activity:today.historyRowValue', {
                        count: weekSessions,
                        time: duration((summary.data?.sessionMinutes ?? 0) * 60),
                      })
                }
                leading={<Icon set="system" name="calendar" size={32} />}
                onPress={() => router.push('/activity/history')}
                divider={false}
              />
            </>
          )}
        </View>
      </Card>

      {/* A connected store that has never had anything in it.
          This is the simulator: an iOS 26 simulator reports HealthKit as
          available and shows the real permission sheet, then reads a year and
          returns nothing, because there is no Health data on it. The offer
          therefore has to live here rather than on the connect screen — by the
          time we know the store is empty, the account is already connected and
          that screen is gone.

          Development builds only, so nothing here can reach a released app. */}
      {__DEV__ && !loading && provider !== 'demo' && summary.data?.activeDays === 0 ? (
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
