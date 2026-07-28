import { APP_NAME, SCHEMA_VERSION } from '@ricecal/shared'
import { Link } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Text, View } from 'react-native'

export default function Home() {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-white px-6">
      {/* If these classes do nothing, the babel jsxImportSource or the
          tailwind content globs are wrong — NativeWind fails silently. */}
      <Text className="text-3xl font-bold text-slate-900">{APP_NAME}</Text>
      <Text className="text-sm text-slate-500">
        schema v{SCHEMA_VERSION} — resolved from @ricecal/shared
      </Text>

      <Link href="/diagnostics" className="mt-4 rounded-lg bg-slate-900 px-5 py-3">
        <Text className="font-semibold text-white">Open diagnostics</Text>
      </Link>

      <StatusBar style="auto" />
    </View>
  )
}
