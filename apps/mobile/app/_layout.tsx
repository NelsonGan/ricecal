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
import { type ReactNode, useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { PendingSnapProvider, SelectedDateProvider, SessionProvider, useSession } from '@/data'
import { LoginLinkHandler } from '@/features/auth'
import { OnboardingDraftProvider } from '@/features/onboarding'
import { initOnlineManager } from '@/lib/online'
import { persistOptions, queryClient } from '@/lib/query'
import { initServices } from '@/lib/startup'
import { fontMap } from '@/theme/fonts'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { NAV_BAR_HEIGHT, ToastProvider } from '@/ui'

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
      <SafeAreaProvider>
        {/* Above the navigator so every screen and every Modal inherits the
            palette — the variable scope follows the React tree, not the native
            view hierarchy. */}
        <ThemeProvider>
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
                    {/* Outside the navigator so a toast survives navigation — a
                        "saved" confirmation usually fires as the screen that
                        triggered it pops. */}
                    <ToastProvider offset={NAV_BAR_HEIGHT}>
                      {/* Under the toast because its one job on failure is to
                          say the link had expired. Renders nothing. */}
                      <LoginLinkHandler />
                      <RootStack />
                    </ToastProvider>
                  </PendingSnapProvider>
                </OnboardingDraftScope>
              </SelectedDateProvider>
            </SessionProvider>
          </PersistQueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
})

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
 * - **Modals present.** The quick selector, the voice sheet and the paywalls come
 *   up over the app and are dismissed rather than navigated back from — a cross in
 *   the `AppBar`, plus the native pull-down. Search and the dish used to be here
 *   and are pages now: both are somewhere you go, work, and come back from.
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
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      {/* The one screen with no back gesture. Everything else in this stack is
          somewhere you went and can leave; the tabs are where the app IS. Onboarding
          replaces its own route on the way out, but "replace" only unwinds what it
          replaced — the seven screens before it are still behind this one, and an
          edge swipe on Today walked back into the questions somebody had just
          finished answering. */}
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
      <Stack.Screen
        name="log/voice"
        options={{ presentation: 'transparentModal', animation: 'fade', gestureEnabled: false }}
      />
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
      <Stack.Screen name="paywall/index" options={{ presentation: 'modal' }} />
      <Stack.Screen name="paywall/gate" options={{ presentation: 'modal' }} />
      <Stack.Screen name="paywall/welcome" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="paywall/reminder" options={{ presentation: 'modal' }} />
      <Stack.Screen name="paywall/ended" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  )
}
