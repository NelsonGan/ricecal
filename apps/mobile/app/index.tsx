import { APP_NAME, SCHEMA_VERSION } from '@ricecal/shared'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'

import { useTheme } from '@/theme/useTheme'
import { Button, Text } from '@/ui'

/**
 * A launcher, not a screen. Phase 0 has no product surfaces yet; this is the
 * way into the two things that do exist.
 *
 * It is built out of `@/ui` rather than raw classes so that a broken design
 * system is visible on the very first frame instead of one navigation later.
 */
export default function Home() {
  const router = useRouter()
  const { isDark } = useTheme()

  return (
    <View className="flex-1 items-center justify-center gap-md bg-canvas px-gutter">
      <Text variant="title">{APP_NAME}</Text>
      <Text variant="meta" className="text-center">
        schema v{SCHEMA_VERSION} — resolved from @ricecal/shared
      </Text>

      <View className="mt-md w-full gap-3">
        <Button fullWidth onPress={() => router.push('/gallery')}>
          Design gallery
        </Button>
        <Button variant="neutral" fullWidth onPress={() => router.push('/diagnostics')}>
          Diagnostics
        </Button>
      </View>

      {/* Explicit rather than "auto": the bar has to contrast with the canvas,
          and the canvas follows our theme, which is not always the OS one. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </View>
  )
}
