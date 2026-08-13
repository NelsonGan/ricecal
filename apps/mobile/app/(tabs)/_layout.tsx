import { Redirect } from 'expo-router'
import { TabList, TabSlot, Tabs, TabTrigger } from 'expo-router/ui'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/data'
import { useReminderSync, useReportLinks } from '@/features/settings'
import { NavBar, NavItem } from '@/ui'

/**
 * Today is the first tab, and saying so is not decoration.
 *
 * Expo Router sorts the screens of a navigator by the LENGTH of their route
 * names, and the tab router's default back behaviour is "go to the first
 * route". Unpinned, `me` is two characters and sorts ahead of `today`, so the
 * router's idea of the first tab was the profile: the Android back button on
 * any tab, and any stray GO_BACK anywhere in the app, jumped to it. Closing the
 * log sheet by dragging its handle was the one people met, because a sheet that
 * dismisses twice sends the second dismissal to the tabs.
 *
 * Naming the anchor puts `today` at index 0, which is where the design has it
 * and where back belongs.
 */
export const unstable_settings = { anchor: 'today' }

/**
 * Five tabs, and no action among them.
 *
 * The log button used to sit in the middle of this bar, which is what capped it
 * at four tabs: the action is centred by having the same number of tabs either
 * side of it, so a fifth put it a tenth of the bar off to one side. It is a
 * floating button on Today now — see `FloatingAction` there — and the bar is
 * five tabs and nothing else.
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
  const { t } = useTranslation()

  // Here rather than in the root layout: they need a session, and this is the
  // first thing that only renders with one. One rewrites the phone's scheduled
  // reminders whenever the settings behind them change; the other opens the
  // review a report notification is about when it is tapped, which has to be
  // behind the same guard because the route it pushes reads the account.
  useReminderSync()
  useReportLinks()

  return (
    <Tabs>
      <TabSlot />
      <TabList asChild>
        <NavBar>
          <TabTrigger name="today" href="/today" asChild>
            <NavItem label={t('nav.today')} icon={{ set: 'ui', name: 'home' }} />
          </TabTrigger>

          {/* Second, where the design puts it: cooking is a thing you go and
              look at, and it sits beside the day it feeds rather than behind
              the reports. A `food` icon, because the pot IS the noun. */}
          <TabTrigger name="recipes" href="/recipes" asChild>
            <NavItem label={t('nav.recipes')} icon={{ set: 'food', name: 'cooking-pot' }} />
          </TabTrigger>

          {/* A `body` icon rather than a `ui` one. The other tabs are interface
              nouns and have interface glyphs; this tab is about a body moving,
              and the set that has a running figure in it is the set the workout
              rows already draw from. */}
          <TabTrigger name="activity" href="/activity" asChild>
            <NavItem label={t('nav.activity')} icon={{ set: 'body', name: 'running-shoe' }} />
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
  )
}
