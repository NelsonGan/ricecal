import '../global.css'

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { initOnlineManager } from '@/lib/online'
import { persistOptions, queryClient } from '@/lib/query'
import { initServices } from '@/lib/startup'
import { fontMap } from '@/theme/fonts'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'

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
            palette — the variable scope follows the React tree, not the
            native view hierarchy. */}
        <ThemeProvider>
          <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
            {/* Outside the navigator so a toast survives navigation — a "saved"
                confirmation usually fires as the screen that triggered it pops. */}
            <ToastProvider>
              <Stack screenOptions={{ headerShown: true }} />
            </ToastProvider>
          </PersistQueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
