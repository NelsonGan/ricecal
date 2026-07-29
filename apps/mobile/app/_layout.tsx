import '../global.css'
// Side-effect import: i18next has to be initialised before the first component
// calls `t`. Its init is synchronous, so importing it here is enough — nothing
// renders a raw key on the first frame.
import '@/i18n'

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { PendingSnapProvider, SelectedDateProvider, SessionProvider } from '@/data'
import { AchievementWatcher } from '@/features/progress'
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

export default function RootLayout() {
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
                <PendingSnapProvider>
                  {/* Outside the navigator so a toast survives navigation — a
                      "saved" confirmation usually fires as the screen that
                      triggered it pops. */}
                  <ToastProvider offset={NAV_BAR_HEIGHT}>
                    {/* Renders nothing. Watches the derived badges and raises a
                        toast the moment one is earned, wherever the user is. */}
                    <AchievementWatcher />
                    <RootStack />
                  </ToastProvider>
                </PendingSnapProvider>
              </SelectedDateProvider>
            </SessionProvider>
          </PersistQueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

/**
 * Every screen draws its own title bar, so the native header is off everywhere.
 *
 * Presentation is declared here rather than per screen because it is a property
 * of how a route enters the app, not of what the route renders — the same food
 * detail is a modal from search and a push from the diary.
 */
function RootStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(tabs)" />
      {/* The quick selector sits over Today, so the screen behind it stays
          visible and the sheet keeps its own scrim. */}
      <Stack.Screen
        name="log/index"
        options={{ presentation: 'transparentModal', animation: 'fade' }}
      />
      <Stack.Screen
        name="log/voice"
        options={{ presentation: 'transparentModal', animation: 'fade' }}
      />
      <Stack.Screen name="log/search" options={{ presentation: 'modal' }} />
      <Stack.Screen name="log/custom" options={{ presentation: 'modal' }} />
      <Stack.Screen name="log/food/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="paywall/index" options={{ presentation: 'modal' }} />
      <Stack.Screen name="paywall/gate" options={{ presentation: 'modal' }} />
      <Stack.Screen name="paywall/welcome" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="paywall/reminder" options={{ presentation: 'modal' }} />
      <Stack.Screen name="paywall/ended" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  )
}
