import { format, parseISO } from 'date-fns'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import {
  useCurrentWeight,
  useMealTimes,
  useProfile,
  useSettings,
  useStreak,
  useSubscription,
  useTargets,
} from '@/data'
import { signOut } from '@/data/auth'
import { ScreenTitle, SettingRow } from '@/features/shared'
import { Avatar, Button, Card, ConfirmSheet, Icon, ListRow, Screen, StatTile, Text } from '@/ui'

/** U1 PROFILE */
export default function MeScreen() {
  const { t } = useTranslation(['profile', 'common'])
  const router = useRouter()

  const { data: profile } = useProfile()
  const { data: settings } = useSettings()
  const { data: targets } = useTargets()
  const { data: subscription } = useSubscription()
  const { data: mealTimes } = useMealTimes()
  const streak = useStreak()
  const weight = useCurrentWeight()
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  const activeConnections = settings
    ? [
        settings.connect_watch,
        settings.connect_phone_health,
        settings.connect_running_app,
        settings.connect_smart_scale,
      ].filter(Boolean).length
    : 0

  const activeReminders =
    (mealTimes ?? []).filter((meal) => meal.reminder_enabled).length +
    (settings
      ? [settings.notify_water, settings.notify_weigh_in, settings.notify_weekly_report].filter(
          Boolean,
        ).length
      : 0)

  const status = subscription?.status ?? 'none'
  const planLine =
    status === 'trial'
      ? t('profile:home.proTrial', {
          when: subscription?.trial_ends_at
            ? t('profile:home.proTrialOn', {
                date: format(parseISO(subscription.trial_ends_at), 'd MMM'),
              })
            : t('profile:home.proTrialTomorrow'),
        })
      : status === 'active'
        ? t('profile:home.proActive')
        : t('profile:home.proNone')

  return (
    <Screen>
      <ScreenTitle title={t('common:nav.me')} />

      <Card>
        <View className="flex-row items-center gap-3">
          <Avatar name={profile?.display_name || '—'} size="md" tone="pandan" />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="subtitle">{profile?.display_name || t('profile:home.noName')}</Text>
            <Text variant="meta">
              {profile?.created_at
                ? t('profile:home.memberSince', {
                    month: format(parseISO(profile.created_at), 'MMMM'),
                  })
                : ''}
            </Text>
          </View>
        </View>

        <View className="flex-row gap-2.5">
          <StatTile
            className="flex-1"
            tone="track"
            label={t('profile:home.streak')}
            value={String(streak.current)}
          />
          <StatTile
            className="flex-1"
            tone="track"
            label={t('profile:home.weight')}
            value={weight === undefined ? '—' : weight.toFixed(1)}
          />
          <StatTile
            className="flex-1"
            tone="track"
            label={t('profile:home.goal')}
            value={targets ? targets.kcal.toLocaleString() : '—'}
          />
        </View>
      </Card>

      <Card>
        <ListRow
          title={t('profile:home.pro')}
          subtitle={planLine}
          leading={<Icon set="system" name="crown" size={42} />}
          divider={false}
          onPress={() => router.push('/settings/subscription')}
        />
      </Card>

      <Card title={t('profile:home.settings')} contentClassName="gap-0">
        <SettingRow
          icon={{ set: 'body', name: 'target' }}
          title={t('profile:home.goals')}
          value={
            targets ? t('profile:home.goalsValue', { kcal: targets.kcal.toLocaleString() }) : '—'
          }
          onPress={() => router.push('/settings/goals')}
        />
        <SettingRow
          icon={{ set: 'system', name: 'sync' }}
          title={t('profile:home.connected')}
          value={t('profile:home.connectedValue', { count: activeConnections })}
          onPress={() => router.push('/settings/connected')}
        />
        <SettingRow
          icon={{ set: 'system', name: 'bell' }}
          title={t('profile:home.reminders')}
          value={t('profile:home.remindersValue', { count: activeReminders })}
          onPress={() => router.push('/settings/reminders')}
        />
        <SettingRow
          icon={{ set: 'system', name: 'language' }}
          title={t('profile:home.units')}
          value={t('profile:home.unitsValue', {
            units: t(`profile:home.${settings?.units ?? 'metric'}`),
            language: (settings?.language ?? 'en').toUpperCase(),
          })}
          onPress={() => router.push('/settings/preferences')}
        />
        <SettingRow
          icon={{ set: 'system', name: 'help' }}
          title={t('profile:home.help')}
          divider={false}
          onPress={() => router.push('/settings/preferences')}
        />
      </Card>

      <Card>
        <Button variant="ghost" fullWidth onPress={() => setConfirmSignOut(true)}>
          {t('profile:home.signOut')}
        </Button>
      </Card>

      {/* Confirmed, because signing out of an app whose data lives on a server
          is not destructive but very much feels like it. */}
      <ConfirmSheet
        visible={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false)
          signOut()
        }}
        title={t('profile:home.signOutTitle')}
        description={t('profile:home.signOutBody')}
        confirmLabel={t('profile:home.signOut')}
      />
    </Screen>
  )
}
