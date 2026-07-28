import { Canvas, Circle } from '@shopify/react-native-skia'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { createMMKV } from 'react-native-mmkv'
import { CartesianChart, Line } from 'victory-native'

import { supabase } from '@/lib/supabase'

/**
 * The Phase 0 verification checklist as a screen. Every row here is one
 * technology proving itself in isolation, before any real data exists to
 * confuse the debugging.
 */

const diagStorage = createMMKV({ id: 'ricecal-diagnostics' })
const LAUNCH_KEY = 'launch-count'

const CHART_DATA = Array.from({ length: 12 }, (_, i) => ({
  day: i,
  kcal: 1800 + Math.round(Math.sin(i / 2) * 300),
}))

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between border-slate-100 border-b py-2">
      <Text className="text-slate-500 text-sm">{label}</Text>
      <Text className="font-medium text-slate-900 text-sm">{value}</Text>
    </View>
  )
}

export default function Diagnostics() {
  const [launches, setLaunches] = useState(0)
  const [session, setSession] = useState('checking…')

  // MMKV: increments once per mount and must survive a force-quit.
  useEffect(() => {
    const next = (diagStorage.getNumber(LAUNCH_KEY) ?? 0) + 1
    diagStorage.set(LAUNCH_KEY, next)
    setLaunches(next)
  }, [])

  // Supabase: an unauthenticated getSession() must resolve to null, not throw.
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) setSession(`error: ${error.message}`)
        else setSession(data.session ? 'signed in' : 'null (expected)')
      })
      .catch((e: Error) => setSession(`threw: ${e.message}`))
  }, [])

  // react-query: static data, persisted to MMKV. Must render after a
  // force-quit in airplane mode — that is the test that matters.
  const { data: cached } = useQuery({
    queryKey: ['phase0-cache-probe'],
    queryFn: async () => ({ stamp: new Date().toISOString() }),
  })

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="p-6 gap-6">
      <View>
        <Text className="mb-2 font-bold text-slate-900 text-xl">Diagnostics</Text>
        <Row label="MMKV launch count" value={String(launches)} />
        <Row label="Supabase session" value={session} />
        <Row label="Cached query stamp" value={cached?.stamp.slice(11, 19) ?? '—'} />
      </View>

      <View>
        <Text className="mb-2 font-semibold text-slate-700">Skia</Text>
        <Canvas style={{ height: 80 }}>
          <Circle cx={40} cy={40} r={32} color="#0f172a" />
        </Canvas>
      </View>

      <View>
        <Text className="mb-2 font-semibold text-slate-700">Victory</Text>
        <View style={{ height: 160 }}>
          <CartesianChart data={CHART_DATA} xKey="day" yKeys={['kcal']}>
            {({ points }) => <Line points={points.kcal} color="#0f172a" strokeWidth={2} />}
          </CartesianChart>
        </View>
      </View>

      <Pressable
        className="rounded-lg bg-slate-100 px-4 py-3"
        onPress={() => {
          diagStorage.remove(LAUNCH_KEY)
          setLaunches(0)
        }}
      >
        <Text className="text-center font-medium text-slate-900">Reset MMKV counter</Text>
      </Pressable>
    </ScrollView>
  )
}
