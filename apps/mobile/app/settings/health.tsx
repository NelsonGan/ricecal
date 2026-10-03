import { Redirect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  useClearDemoActivity,
  useConnectHealth,
  useDisconnectHealth,
  useHealthConnection,
  useSession,
  useSettings,
  useSyncHealth,
  useUpdateSettings,
} from '@/data'
import { ConnectPanel, count, syncedAgo } from '@/features/activity'
import { ToggleRow } from '@/features/shared'
import { type Availability, canOfferDemo, offeredProviders, type ProviderId } from '@/lib/health'
import { useBack } from '@/lib/navigation'
import {
  AppBar,
  Badge,
  Button,
  Card,
  ConfirmSheet,
  Icon,
  ListRow,
  Screen,
  Skeleton,
  Stepper,
  Text,
} from '@/ui'

/**
 * The session guard, as its own component. Everything below reaches `useUserId`,
 * which throws by design without a session, and two things reach this screen
 * without one: a deep link, which never passes the guard at `/`, and a Fast
 * Refresh, where `SessionProvider` re-initialises and every mounted screen
 * re-renders into the gap.
 *
 * A wrapper rather than an early return, because the check has to happen before
 * any hook below runs. The sibling screens in `app/settings/` have the same
 * exposure and are left alone: a shared `_layout.tsx` would fix all six and would
 * also nest them in a new navigator.
 */
export default function HealthSettingsRoute() {
  const { session, loading } = useSession()

  if (loading) return null
  if (!session) return <Redirect href="/sign-in" />

  return <HealthSettingsScreen />
}

/**
 * N6: what is connected, what it gives us, and how to stop it.
 *
 * The "WHAT WE READ" list is per data type rather than per app. On Android each
 * row can say whether that type was actually granted, because Health Connect
 * returns the permissions it gave; on iOS every row says "On", because HealthKit
 * refuses to report whether a READ was allowed — deliberately, since knowing an
 * app was denied is itself information about the user. The honest signal there
 * is an empty day list on Today, not a row on this screen.
 *
 * Not connected, it is where a store is connected: the Activity tab that used to
 * do it is gone, and this is the screen Me already links to by the same name.
 *
 * Disconnecting keeps the history. See `useDisconnectHealth` for why.
 */
function HealthSettingsScreen() {
  const { t } = useTranslation(['activity', 'profile', 'common'])
  const goBack = useBack('/me')

  const connection = useHealthConnection()
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const sync = useSyncHealth()
  const disconnect = useDisconnectHealth()
  const clearDemo = useClearDemoActivity()

  const [confirming, setConfirming] = useState(false)

  // What the platform will allow, asked once on mount. State rather than a
  // query because it is a question about this device, not about this account,
  // and nothing invalidates it but the user going to Settings and coming back.
  const [availability, setAvailability] = useState<Availability | null>(null)
  const check = useCallback(() => {
    offeredProviders().then(({ native }) => setAvailability(native.availability))
  }, [])
  useEffect(check, [check])

  const connect = useConnectHealth()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [cameBackEmpty, setCameBackEmpty] = useState(false)
  const onConnect = (id: ProviderId) => {
    setCameBackEmpty(false)
    setProgress(null)
    connect.mutate(
      { provider: id, onProgress: setProgress },
      {
        // Zero days after a granted-looking connect is the only signal iOS
        // gives that the read was refused. See `apple.ts`.
        onSuccess: (result) => setCameBackEmpty(result.granted && result.days === 0),
      },
    )
  }

  const provider = connection.data?.provider ?? null
  const connected = connection.data?.connected ?? false
  const synced = syncedAgo(connection.data?.lastSyncedAt ?? null)
  const granted = new Set(connection.data?.permissions ?? [])

  if (connection.isPending) {
    return (
      <Screen
        header={
          <AppBar
            title={t('activity:settings.title')}
            onBack={goBack}
            backLabel={t('common:action.back')}
          />
        }
      >
        <Card>
          <Skeleton className="h-[200px] w-full" />
        </Card>
      </Screen>
    )
  }

  return (
    <Screen
      header={
        <AppBar
          title={t('activity:settings.title')}
          onBack={goBack}
          backLabel={t('common:action.back')}
        />
      }
    >
      {provider && connected ? (
        <>
          <Card title={t('activity:settings.connectedTitle')}>
            <View className="gap-4">
              <View className="flex-row items-center gap-md">
                <Icon set="system" name="watch" size={36} />
                {/* The watch AND the freshness, not one or the other.
                    These shared a line, so learning the device name cost you
                    the only place the app said when it last read anything —
                    and the two answer different questions ("what is this
                    connected to" and "is what I am looking at current"). It
                    went unnoticed because `deviceName` was never populated on
                    iOS at all; now that it is, the line has to hold both. */}
                <View className="min-w-0 flex-1">
                  <Text variant="bodyStrong">
                    {connection.data?.deviceName ?? t(`activity:provider.${provider}`)}
                  </Text>
                  <Text variant="meta">
                    {t('activity:settings.lastSynced', {
                      when: t(`activity:today.${synced.key}`, {
                        count: synced.count,
                      }).toLowerCase(),
                    })}
                  </Text>
                </View>
                <Badge tone="pandan">
                  <Text variant="caption" className="text-pandan-ink">
                    {t('activity:settings.granted')}
                  </Text>
                </Badge>
              </View>

              <Button
                variant="secondary"
                fullWidth
                loading={sync.isPending}
                disabled={sync.isPending}
                onPress={() => sync.mutate(provider)}
                leftIcon={<Icon set="system" name="sync" size={20} />}
              >
                {sync.isPending ? t('activity:settings.syncing') : t('activity:settings.syncNow')}
              </Button>
            </View>
          </Card>

          <Card title={t('activity:settings.sourceTitle')} flush>
            <View className="px-7">
              {READS.map((read, index) => (
                <ListRow
                  key={read.key}
                  title={t(read.label)}
                  leading={<Icon {...read.icon} size={30} />}
                  chevron={false}
                  divider={index < READS.length - 1}
                  trailing={
                    // Only Health Connect can answer this per type. On iOS every
                    // row says "On", which is what we asked for rather than what
                    // was granted — and the screen says so in its header comment
                    // because there is no honest way to say it in a row.
                    <Text
                      variant="meta"
                      className={
                        provider !== 'health_connect' || granted.has(read.connectType)
                          ? 'text-pandan-ink'
                          : 'text-muted'
                      }
                    >
                      {provider !== 'health_connect' || granted.has(read.connectType)
                        ? t('activity:settings.granted')
                        : t('activity:settings.notGranted')}
                    </Text>
                  }
                />
              ))}
            </View>
          </Card>
        </>
      ) : (
        <ConnectPanel
          availability={availability ?? { ok: false, reason: 'wrong-platform' }}
          demo={canOfferDemo(availability ?? { ok: true }, cameBackEmpty)}
          busy={connect.isPending}
          progress={progress}
          cameBackEmpty={cameBackEmpty}
          onConnect={onConnect}
          onRecheck={check}
        />
      )}

      <Card flush>
        <View className="px-7">
          <ToggleRow
            title={t('activity:settings.extendBudget')}
            description={t('activity:settings.extendBudgetBody')}
            value={settings?.activity_extends_budget ?? true}
            onValueChange={(value) => updateSettings.mutate({ activity_extends_budget: value })}
          />

          <View className="flex-row items-center gap-md py-3.5">
            <View className="min-w-0 flex-1">
              <Text variant="bodyStrong">{t('activity:settings.stepGoal')}</Text>
            </View>
            {/* A stepper rather than a slider: a step goal is a round number
                people name — 8,000, 10,000 — not a value swept to. */}
            <Stepper
              decrementLabel={t('common:a11y.decrease')}
              incrementLabel={t('common:a11y.increase')}
              value={settings?.step_goal ?? 8000}
              onChange={(value) => updateSettings.mutate({ step_goal: value })}
              min={1000}
              max={30000}
              step={500}
              // Separated, like the same number everywhere else it appears —
              // "Goal 8,000 steps" on the steps screen is this figure. The
              // default format is fraction-aware for portions and left this one
              // reading "8000". Display only: this stepper is not `editable`,
              // so no separator ever reaches the parser.
              format={count}
              accessibilityLabel={t('activity:settings.stepGoal')}
            />
          </View>
        </View>
      </Card>

      {provider === 'demo' ? (
        // Generated rows are not history, so this is a real delete rather than a
        // disconnect. Only ever reachable on a build that offered demo data.
        <Card tone="kaya">
          <View className="gap-2">
            <Text variant="body" className="text-kaya-ink">
              {t('activity:settings.clearDemoBody')}
            </Text>
            <Button
              variant="danger"
              fullWidth
              loading={clearDemo.isPending}
              onPress={() => clearDemo.mutate(undefined, { onSuccess: goBack })}
            >
              {t('activity:settings.clearDemo')}
            </Button>
          </View>
        </Card>
      ) : provider && connected ? (
        <Card>
          <View className="gap-2">
            <Text variant="meta">{t('activity:settings.disconnectBody')}</Text>
            <Button variant="neutral" fullWidth onPress={() => setConfirming(true)}>
              {t('activity:settings.disconnect')}
            </Button>
          </View>
        </Card>
      ) : null}

      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          if (provider) await disconnect.mutateAsync(provider)
          setConfirming(false)
        }}
        title={t('activity:settings.disconnectConfirm')}
        description={t('activity:settings.disconnectConfirmBody')}
        confirmLabel={t('activity:settings.disconnect')}
        cancelLabel={t('common:action.cancel')}
        tone="danger"
      />
    </Screen>
  )
}

/**
 * The four things RiceCal reads, paired with the Health Connect record type
 * that grants each one.
 *
 * `connectType` is only meaningful on Android; on iOS the column is what was
 * requested. Kept as one list either way so the screen does not fork.
 */
const READS = [
  {
    key: 'energy',
    label: 'activity:connect.energy',
    connectType: 'ActiveCaloriesBurned',
    icon: { set: 'body', name: 'flame-burn' },
  },
  {
    key: 'steps',
    label: 'activity:connect.steps',
    connectType: 'Steps',
    icon: { set: 'body', name: 'footprints' },
  },
  {
    key: 'workouts',
    label: 'activity:connect.workouts',
    connectType: 'ExerciseSession',
    icon: { set: 'body', name: 'stopwatch' },
  },
  {
    key: 'heart',
    label: 'activity:connect.heart',
    connectType: 'HeartRate',
    icon: { set: 'body', name: 'heart-rate' },
  },
] as const
