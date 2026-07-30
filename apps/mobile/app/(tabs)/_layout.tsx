import { Redirect, useRouter } from 'expo-router'
import { TabList, TabSlot, Tabs, TabTrigger } from 'expo-router/ui'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useSession } from '@/data'
import { useReminderSync } from '@/features/settings'
import { NavAction, NavBar, NavItem } from '@/ui'

/**
 * Three tabs, a held-open gap, and the raised centre action.
 *
 * Built on the headless `expo-router/ui` tabs rather than a styled navigator,
 * because the FAB is not a tab: it opens a modal and must sit between the
 * second and third slots without being one itself.
 *
 * `TabList asChild` unwraps exactly one layer to find its triggers, which is
 * why `NavBar` takes them as direct children — and why a non-trigger among them,
 * the action or the spacer, is fine: it looks for triggers rather than insisting
 * every child is one.
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
  const { t } = useTranslation()
  const router = useRouter()

  // Here rather than in the root layout: it needs a session, and this is the
  // first thing that only renders with one. Rewrites the phone's scheduled
  // reminders whenever the settings behind them change.
  useReminderSync()

  return (
    <Tabs>
      <TabSlot />
      <TabList asChild>
        <NavBar>
          <TabTrigger name="today" href="/today" asChild>
            <NavItem label={t('nav.today')} icon={{ set: 'ui', name: 'home' }} />
          </TabTrigger>

          {/* The diary's slot, held open and empty.
              It is a spacer rather than nothing at all because the raised action is
              centred by having the same number of tabs either side of it; with three
              tabs it sits a sixth of the bar off to one side. Whatever goes here
              next inherits the space. */}
          <View className="min-w-0 flex-1" />

          <NavAction onPress={() => router.push('/log')} label={t('nav.log')} />

          <TabTrigger name="trends" href="/trends" asChild>
            <NavItem label={t('nav.trends')} icon={{ set: 'ui', name: 'trends' }} />
          </TabTrigger>
          <TabTrigger name="me" href="/me" asChild>
            <NavItem label={t('nav.me')} icon={{ set: 'ui', name: 'profile' }} />
          </TabTrigger>
        </NavBar>
      </TabList>
    </Tabs>
  )
}
