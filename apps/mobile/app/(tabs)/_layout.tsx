import { Redirect, useRouter } from 'expo-router'
import { TabList, TabSlot, Tabs, TabTrigger } from 'expo-router/ui'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useHealthAutoSync, useHealthConnection, useSession, useWorkoutOutbox } from '@/data'
import { useAnalyticsIdentity } from '@/features/analytics'
import { useReminderSync, useReportLinks } from '@/features/settings'
import {
  ActiveWorkoutBar,
  clock,
  shortClock,
  useHasActiveWorkout,
  useLiveWorkout,
  useNow,
  WorkoutEffects,
} from '@/features/workouts'
import {
  NAV_BAR_HEIGHT,
  NavAction,
  NavBar,
  NavInsetProvider,
  NavItem,
  useNavBarFootprint,
} from '@/ui'

/**
 * Today is the first tab, and saying so is not decoration.
 *
 * Expo Router sorts a navigator's screens by the length of their route names, and
 * the tab router's default back behaviour is "go to the first route". Unpinned,
 * `me` sorts ahead of `today`, so the router's first tab was the profile: the
 * Android back button on any tab, and any stray GO_BACK, jumped to it. Closing
 * the log sheet by dragging its handle was the one people met, because a sheet
 * that dismisses twice sends the second dismissal to the tabs.
 *
 * Naming the anchor puts `today` at index 0, where back belongs.
 */
export const unstable_settings = { anchor: 'today' }

/**
 * Five tabs, and the add action at the right end of the bar. Workouts sits
 * beside Today because the two are the daily pair: what went in, and what was
 * done. It used to float
 * over Today alone; in the bar it is one tap away on every tab. See `NavBar`.
 *
 * Still the headless `expo-router/ui` tabs rather than a styled navigator,
 * because `NavBar` / `NavItem` are the design system's and a native tab bar
 * cannot be made to look like them. `TabList asChild` unwraps exactly one layer
 * to find its triggers, which is why `NavBar` takes them as direct children.
 */
export default function TabsLayout() {
  const { session, loading } = useSession()

  // The other half of the guard at `/`. Signing out happens from inside these
  // tabs, so without this the user is left on a screen whose every query has
  // just started failing.
  //
  // The guard has to come BEFORE anything that reads the session, which is why
  // the tab bar itself is a separate component. `useReminderSync` reaches
  // `useUserId`, and that throws by design when there is no session — a rule
  // hooks made impossible to honour here, since the call could not be skipped
  // ahead of this early return. The visible failure was a red
  // "useUserId called with no session" screen, and a blank one after dismissing
  // it, whenever the session went away while the tabs were mounted: signing
  // out, a token that failed to persist, or a Fast Refresh in development.
  if (loading) return null
  if (!session) return <Redirect href="/sign-in" />

  return <SignedInTabs />
}

function SignedInTabs() {
  const { t } = useTranslation(['common', 'social'])
  const router = useRouter()
  const navFootprint = useNavBarFootprint()

  // Here rather than in the root layout: they need a session, and this is the
  // first thing that only renders with one. One rewrites the phone's scheduled
  // reminders whenever the settings behind them change; the other opens the
  // review a report notification is about when it is tapped, which has to be
  // behind the same guard because the route it pushes reads the account.
  useReminderSync()
  useReportLinks()
  // The third of the same kind: it keeps PostHog's picture of the account in
  // step with the profile, which matters most on a handset that never ran
  // onboarding — a reinstall, or signing in on a second phone.
  useAnalyticsIdentity()
  // And the health sync. It used to run on the Activity tab; here it also
  // covers a launch that lands on another tab, such as a report notification.
  const health = useHealthConnection()
  useHealthAutoSync(health.data?.connected ? health.data.provider : null)
  // And the workouts' two background duties: sending finished workouts that
  // are still on the phone, and the rest timer, "still training?" and Live
  // Activity of one that is running (`<WorkoutEffects />` below), which matter
  // most when its screen is not the one on top.
  useWorkoutOutbox()
  const { userId } = useSession()
  const running = useHasActiveWorkout(userId)

  return (
    // The bar floats over the screens, so each one is told how much of its
    // bottom the bar covers. See `useNavInset`.
    <NavInsetProvider value={navFootprint + (running ? WORKOUT_BAR_SPACE : 0)}>
      <Tabs>
        <TabSlot />
        <TabList asChild>
          <NavBar action={<NavAction onPress={() => router.push('/log')} label={t('nav.log')} />}>
            <TabTrigger name="today" href="/today" asChild>
              <NavItem label={t('nav.today')} icon={{ set: 'ui', name: 'home' }} />
            </TabTrigger>

            <TabTrigger name="workouts" href="/workouts" asChild>
              <NavItem label={t('nav.workouts')} icon={{ set: 'body', name: 'dumbbell' }} />
            </TabTrigger>

            <TabTrigger name="feed" href="/feed" asChild>
              <NavItem label={t('social:feed')} icon={{ set: 'system', name: 'users-group' }} />
            </TabTrigger>

            <TabTrigger name="trends" href="/trends" asChild>
              <NavItem label={t('nav.trends')} icon={{ set: 'ui', name: 'trends' }} />
            </TabTrigger>
            <TabTrigger name="me" href="/me" asChild>
              <NavItem label={t('nav.me')} icon={{ set: 'ui', name: 'profile' }} />
            </TabTrigger>
          </NavBar>
        </TabList>
      </Tabs>
      {running ? <RunningWorkout /> : null}
      <WorkoutEffects />
    </NavInsetProvider>
  )
}

/** The minimised bar's own height plus the gap above the tabs. */
const WORKOUT_BAR_SPACE = 66

/**
 * The workout in progress, minimised to a bar over the tabs on every tab.
 * Its own component so the clock re-renders the bar and not the navigator.
 */
function RunningWorkout() {
  const { t } = useTranslation('workouts')
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { workout } = useLiveWorkout()
  const now = useNow(1000)
  if (!workout) return null
  const resting = workout.rest && workout.rest.endsAt > now ? workout.rest.endsAt - now : null

  return (
    <View
      className="absolute inset-x-0 px-gutter"
      style={{ bottom: (insets.bottom || 12) + NAV_BAR_HEIGHT + 8 }}
      pointerEvents="box-none"
    >
      <ActiveWorkoutBar
        name={workout.name}
        elapsed={clock((now - workout.startedAt) / 1000)}
        resting={resting === null ? null : t('logger.rest', { time: shortClock(resting / 1000) })}
        onPress={() => router.push('/workout/active')}
      />
    </View>
  )
}
