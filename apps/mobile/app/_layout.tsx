import '../global.css'
// Side-effect import: i18next has to be initialised before the first component
// calls `t`. Its init is synchronous, so importing it here is enough — nothing
// renders a raw key on the first frame.
import '@/i18n'

import * as Sentry from '@sentry/react-native'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import {
  PendingSnapProvider,
  RefiningProvider,
  SelectedDateProvider,
  SessionProvider,
  useSession,
} from '@/data'
import { LoginLinkHandler } from '@/features/auth'
import { OnboardingDraftProvider } from '@/features/onboarding'
import { EntitlementSync } from '@/features/paywall'
import { LanguageSync } from '@/features/settings'
import { WidgetSync } from '@/features/widgets'
import { currentLanguage, scriptFor } from '@/i18n'
import { initOnlineManager } from '@/lib/online'
import { persistOptions, queryClient } from '@/lib/query'
import { initServices } from '@/lib/startup'
import { fontMap } from '@/theme/fonts'
import { storedThemePreference, storeThemePreference } from '@/theme/preference'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { NAV_BAR_HEIGHT, NumpadProvider, TextScriptProvider, ToastProvider } from '@/ui'

// Bind react-query to NetInfo at module scope so the very first query already
// has a correct view of connectivity, rather than one render late.
initOnlineManager()

// Hold the splash until the typefaces are in memory. Without it the first frame
// paints in the system font and visibly reflows when Baloo 2 arrives, which is
// impossible to miss on the large display numerals.
SplashScreen.preventAutoHideAsync()

export default Sentry.wrap(function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontMap)

  useEffect(() => {
    initServices()
  }, [])

  useEffect(() => {
    // Hide on error too. A fallback font is a bad look; a splash screen that
    // never goes away is a broken app.
    if (fontsLoaded || fontError) SplashScreen.hideAsync()
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* The one thing in the app that watches the keyboard. It has to sit
          above every screen because it is a native measurement rather than a
          component: `Screen` and `Sheet` read the position it publishes, and
          on Android it is what takes the window edge-to-edge so a keyboard
          moves what we say it moves instead of resizing the window under us.

          Outside `SafeAreaProvider` deliberately. Nothing here reads an inset,
          and the edge-to-edge switch it performs on Android is what the inset
          provider then has to report — so it has to have happened first. */}
      <KeyboardProvider>
        <SafeAreaProvider>
          {/* Holds whichever numeric field is being typed into, and the height
              its pad is taking. Inside the inset provider because that height
              ends at the home indicator; above everything else because both
              `Screen` and `Sheet` read it. */}
          <NumpadScope>
            {/* Above the navigator so every screen and every Modal inherits the
            palette — the variable scope follows the React tree, not the native
            view hierarchy. */}
            {/* Above the navigator for the reason the palette is: every screen
            and every Modal reads it, and the scope follows the React tree. It
            decides how much vertical room a line of type needs, which is a
            property of the script the app is currently set in. */}
            <TextScriptScope>
              <ThemeScope>
                <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
                  {/* Inside the query provider, because signing in and out clears the
                cache — one account's diary must never appear under another's
                name, even for a frame. */}
                  <SessionProvider>
                    {/* Which day the diary is showing, and snaps whose dish is not
                  known yet. Both are the client's own state: nothing to fetch,
                  nothing to invalidate. */}
                    <SelectedDateProvider>
                      {/* Above the navigator because the index route reads it to
                    decide where a launch belongs, and the questions are answered
                    before there is an account to write them to. Backed by MMKV,
                    so it survives the app being killed mid-flow. */}
                      <OnboardingDraftScope>
                        <PendingSnapProvider>
                          {/* Entries with a fix-by-typing correction in flight —
                        same shape as pending snaps: the work outlives the
                        screen that started it. */}
                          <RefiningProvider>
                            {/* Outside the navigator so a toast survives navigation — a
                          "saved" confirmation usually fires as the screen that
                          triggered it pops. */}
                            <ToastProvider offset={NAV_BAR_HEIGHT}>
                              {/* Under the toast because its one job on failure is to
                            say the link had expired. Renders nothing. */}
                              <LoginLinkHandler />
                              {/* Also renders nothing. Keeps the store's answer
                            about this account and our own mirror of it in step,
                            so a purchase unlocks the app without waiting on a
                            webhook. Inside `SessionProvider` because it is
                            keyed by whoever is signed in. */}
                              <EntitlementSync />
                              {/* Renderless too. Copies the chosen language into
                            `user_settings.language` so the server knows which
                            one to write back in, one direction only — see the
                            component for why reading the row would undo the
                            setting. Inside `SessionProvider` because the row
                            belongs to whoever is signed in. */}
                              <LanguageSync />
                              {/* And renders nothing either. Publishes today
                            into the App Group the home screen widgets read,
                            sends the drinks the water widget could not, and
                            notices which widgets are actually on a home
                            screen. Inside `SessionProvider` because all three
                            are about one account's day. */}
                              <WidgetSync />
                              <RootStack />
                            </ToastProvider>
                          </RefiningProvider>
                        </PendingSnapProvider>
                      </OnboardingDraftScope>
                    </SelectedDateProvider>
                  </SessionProvider>
                </PersistQueryClientProvider>
              </ThemeScope>
            </TextScriptScope>
          </NumpadScope>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
})

/**
 * Tells the design system which writing system it is setting type in.
 *
 * `useTranslation` is here for the subscription rather than for `t`: it
 * re-renders this on `languageChanged`, which is what makes the leading follow
 * a switch in the preferences card without a reload. See `src/ui/TextScript.tsx`
 * for what the three answers mean and why a metric is not a word.
 */
function TextScriptScope({ children }: { children: ReactNode }) {
  useTranslation()

  return <TextScriptProvider script={scriptFor(currentLanguage())}>{children}</TextScriptProvider>
}

/**
 * Holds the two ends of `ThemeProvider`'s persistence contract together.
 *
 * The provider takes an initial preference and reports every change; the store
 * is `src/theme/preference.ts`. Both here rather than split across the layout
 * and the settings screen, because a read in one file and a write in another is
 * how they came to disagree in the first place — the read existed, the write
 * did not, and Dark lasted until the app was next killed.
 *
 * `useState` for the initial read so it happens ONCE, before the first paint,
 * rather than on every re-render of the root. `storeThemePreference` is passed
 * by reference rather than wrapped in an arrow, because the provider memoises
 * its setter on this prop and a new function each render would re-render every
 * consumer of the theme.
 */
function ThemeScope({ children }: { children: ReactNode }) {
  const [initial] = useState(storedThemePreference)

  return (
    <ThemeProvider initialPreference={initial} onPreferenceChange={storeThemePreference}>
      {children}
    </ThemeProvider>
  )
}

/**
 * The number pad, with its copy.
 *
 * A component of its own only because the design system takes no words: every
 * label in `src/ui` is a prop, and this is the one provider whose caller is the
 * root layout rather than a screen with a `t` already in scope.
 */
function NumpadScope({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common')
  const labels = useMemo(
    () => ({
      done: t('action.done'),
      backspace: t('a11y.backspace'),
      decimal: t('a11y.decimalPoint'),
    }),
    [t],
  )

  return <NumpadProvider labels={labels}>{children}</NumpadProvider>
}

/**
 * Hands the draft provider the signed-in user, and nothing else.
 *
 * A component of its own because `RootLayout` sits ABOVE `SessionProvider` and so
 * cannot read the session, while the draft module deliberately does not import
 * the data layer — pulling it in would build the Supabase client at import time,
 * which no test environment can do. One `string | null` crossing the boundary is
 * all either side needs.
 */
function OnboardingDraftScope({ children }: { children: ReactNode }) {
  const { userId } = useSession()

  return <OnboardingDraftProvider userId={userId}>{children}</OnboardingDraftProvider>
}

/**
 * Every screen draws its own title bar, so the native header is off everywhere.
 *
 * Presentation is declared here rather than per screen because it is a property
 * of how a route enters the app, not of what the route renders.
 *
 * Two shapes, and the difference is deliberate:
 *
 * - **Full pages push.** Settings, the progress reports and the gallery slide in
 *   from the right, keep the screen behind them on the stack, and pop with the
 *   edge swipe. They carry a chevron in their own `AppBar`.
 * - **Modals present.** The quick selector and the paywalls come up over the app
 *   and are dismissed rather than navigated back from — a cross in the `AppBar`,
 *   plus the native pull-down. Search and the dish used to be here and are pages
 *   now: both are somewhere you go, work, and come back from.
 *
 * `animation` is left at the platform default rather than forced to
 * `slide_from_right`: setting it globally also reaches the `presentation: modal`
 * screens below, which then slide in sideways instead of rising, and the cross
 * in their bar stops matching how they arrived.
 */
function RootStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Explicit rather than relying on the default. The interactive pop is
        // the only back affordance a user reaches for without looking, and a
        // future screen that sets its own options should have to opt out of it
        // on purpose.
        gestureEnabled: true,
        // Edge-only, matching UIKit. A full-width drag competes with the
        // horizontal scrollers on Trends and the week strip on Today.
        fullScreenGestureEnabled: false,
      }}
    >
      {/* The flow crosses between these two groups — the account screen is in
          `(auth)` and the flush replaces it — so a swipe on either would unwind
          the ROOT stack rather than the questions the user walked. Off on both,
          for the reason written out in `(onboarding)/_layout.tsx`. */}
      <Stack.Screen name="(auth)" options={{ gestureEnabled: false }} />
      {/* Where a link in an email lands. It is a spinner that redirects, and it
          exists because the router matches paths against files: with no file at
          `auth/callback`, tapping the button in a login mail opened the app on
          "Page not found" while the sign-in it had just performed went through
          invisibly behind it. No gesture, for the same reason as the groups
          either side: there is nothing behind a link opened cold. */}
      <Stack.Screen name="auth/[action]" options={{ gestureEnabled: false }} />
      {/* Where a home screen widget lands, for the same reason the line above
          exists: the router matches paths against files, and `ricecal://widget/camera`
          with no file behind it opens the app on "Page not found". It is a
          spinner that redirects, and it is where a widget tap is counted. */}
      <Stack.Screen name="widget/[action]" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(onboarding)" options={{ gestureEnabled: false }} />
      {/* The one screen with no back gesture. Everything else in this stack is
          somewhere you went and can leave; the tabs are where the app IS.

          Nothing should be behind this any more — `useEnterApp` unwinds the way
          in rather than replacing one entry of it, which is what left the whole
          of onboarding under the diary and made an edge swipe on Today land on
          the questions somebody had just finished answering. The gesture stays
          off regardless: a swipe on the app itself should do nothing, whatever
          a future route happens to leave lying around. */}
      <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
      {/* The quick selector sits over Today, so the screen behind it stays
          visible and the sheet keeps its own scrim.

          `gestureEnabled: false` on both, and it is not cosmetic. A modal
          presentation gets a native pull-down dismissal, and these sheets have a
          drag handle of their own now — so a downward swipe ran both. The native
          one popped the route; the handle's `onClose` then called `back()` on a
          stack that had already unwound, which popped the TAB underneath and
          landed the user on a different tab. One dismissal, from the handle. */}
      <Stack.Screen
        name="log/index"
        options={{ presentation: 'transparentModal', animation: 'fade', gestureEnabled: false }}
      />
      {/* The tour. A page rather than a modal: it is somewhere you go, read and
          come back from, and it is reached from a toast on Today and from a row
          in Me — both places worth returning to. */}
      <Stack.Screen name="tutorial" />
      {/* Search pushes. It is a place you go and come back from, not something
          that comes up over the day: the query survives the trip to a dish and
          back, the edge swipe returns to it, and its bar carries a chevron. As a
          modal it also stacked a second presentation on top of the quick
          selector, which is already one. */}
      <Stack.Screen name="log/search" />
      {/* The dish pushes. It is where a portion is chosen and an entry edited —
          several controls, a note field, a delete — which is a page of work
          rather than something glanced at over the day, and it is reached from
          search, which is now a page too. */}
      <Stack.Screen name="log/food/[id]" />
      {/* ONE recipe pushes; the LIST is a tab. Singular and plural, and the
          split is the information hierarchy rather than a naming quirk: the
          collection is somewhere the app IS, and a recipe is somewhere you go,
          edit and come back from.

          One entry, not two: the group has a layout of its own, because a
          shared recipe is a link and a link is opened cold. See
          `recipe/_layout.tsx`. */}
      <Stack.Screen name="recipe" />
      {/* The reviews push, and the group holds both the list and one review.
          The story inside it presents full screen rather than pushing, because
          a horizontal swipe there means "next step" and a pushed screen would
          spend that gesture going back. See `reviews/_layout.tsx`. */}
      <Stack.Screen name="reviews" />
      {/* One suggestion, pushed from the sheet that listed five. A full page
          rather than a second sheet: it is somewhere you go and come back from,
          and stacking a modal on a modal would leave the picks' scrim over the
          app behind it. */}
      <Stack.Screen name="suggest" />
      {/* The one paywall that is not dismissable by gesture: it replaces the
          tour at the end of onboarding, so there is nothing behind it to swipe
          back to. "Maybe later" is the way out and it is on the screen. */}
      <Stack.Screen
        name="paywall/intro"
        options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
      />
      {/* `paywall/index` has no entry at all, and that is the decision rather
          than an omission: it is A PAGE, not a modal — ten features, three
          plans and small print, reached from the dish that was about to be
          logged — so it takes the stack's default push and wears a back
          chevron like every other full page here.

          These three do present. Welcome and ended are arrivals rather than
          places: one lands after a purchase settles and the other after a
          subscription lapses, and neither has a screen behind it worth
          returning to. The reminder is a sheet-sized nudge. */}
      <Stack.Screen name="paywall/welcome" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="paywall/reminder" options={{ presentation: 'modal' }} />
      <Stack.Screen name="paywall/ended" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  )
}
