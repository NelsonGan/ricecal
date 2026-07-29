import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { ScreenTitle, SettingRow } from '@/features/shared'
import { useAppState } from '@/mock'
import { Avatar, Card, Icon, ListRow, Screen, StatTile, Text } from '@/ui'

/** U1 PROFILE */
export default function MeScreen() {
  const { t } = useTranslation(['profile', 'common'])
  const router = useRouter()
  const { profile, targets, streak, subscription, reminders, connections } = useAppState(
    (state) => ({
      profile: state.profile,
      targets: state.targets,
      streak: state.streak,
      subscription: state.subscription,
      reminders: state.reminders,
      connections: state.connections,
    }),
  )

  const activeConnections = [
    connections.watch,
    connections.phoneHealth,
    connections.runningApp,
    connections.smartScale,
  ].filter(Boolean).length

  const activeReminders = [
    reminders.breakfast,
    reminders.lunch,
    reminders.dinner,
    reminders.water,
    reminders.weighIn,
    reminders.weeklyReport,
  ].filter(Boolean).length

  const planLine =
    subscription.status === 'trial'
      ? t('profile:home.proTrial', {
          when:
            subscription.trialDaysLeft <= 1
              ? t('profile:home.proTrialTomorrow')
              : t('profile:home.proTrialIn', { count: subscription.trialDaysLeft }),
        })
      : subscription.status === 'active'
        ? t('profile:home.proActive')
        : t('profile:home.proNone')

  return (
    <Screen>
      <ScreenTitle title={t('common:nav.me')} />

      <Card>
        <View className="flex-row items-center gap-3">
          <Avatar name={profile.name} size="md" tone="pandan" />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="subtitle">{profile.name}</Text>
            <Text variant="meta">
              {t('profile:home.memberSince', { month: profile.memberSinceMonth })}
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
            value={profile.weightKg.toFixed(1)}
          />
          <StatTile
            className="flex-1"
            tone="track"
            label={t('profile:home.goal')}
            value={targets.kcal.toLocaleString()}
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

      <Card title={t('profile:home.settings')}>
        <SettingRow
          icon={{ set: 'body', name: 'target' }}
          title={t('profile:home.goals')}
          value={t('profile:home.goalsValue', { kcal: targets.kcal.toLocaleString() })}
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
            units: t(`profile:home.${profile.units}`),
            language: profile.language.toUpperCase(),
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
    </Screen>
  )
}
