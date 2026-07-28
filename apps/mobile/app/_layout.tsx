import '../global.css'

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { Stack } from 'expo-router'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { initOnlineManager } from '@/lib/online'
import { persistOptions, queryClient } from '@/lib/query'
import { initServices } from '@/lib/startup'

// Bind react-query to NetInfo at module scope so the very first query already
// has a correct view of connectivity, rather than one render late.
initOnlineManager()

export default function RootLayout() {
  useEffect(() => {
    initServices()
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <Stack screenOptions={{ headerShown: true }} />
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
