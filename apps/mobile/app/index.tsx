import { APP_NAME, SCHEMA_VERSION } from '@ricecal/shared'
import { Link } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Pressable, Text, View } from 'react-native'

export default function Home() {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-white px-6">
      {/* If these classes do nothing, the babel jsxImportSource or the
          tailwind content globs are wrong — NativeWind fails silently. */}
      <Text className="text-3xl font-bold text-slate-900">{APP_NAME}</Text>
      <Text className="text-sm text-slate-500">
        schema v{SCHEMA_VERSION} — resolved from @ricecal/shared
      </Text>

      {/* `asChild` matters: expo-router's Link renders a Text, not a View, so
          background/radius/padding classes on it are silently dropped and the
          white label lands on the white page — present in the accessibility
          tree, invisible to a user. Delegating to a Pressable gives a real
          View to style. */}
      <Link href="/diagnostics" asChild>
        <Pressable className="mt-4 rounded-lg bg-slate-900 px-5 py-3">
          <Text className="font-semibold text-white">Open diagnostics</Text>
        </Pressable>
      </Link>

      <StatusBar style="auto" />
    </View>
  )
}
