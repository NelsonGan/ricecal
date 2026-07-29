import { useTranslation } from 'react-i18next'
import { useSettings, useUpdateSettings } from '@/data'
import { ToggleRow } from '@/features/shared'
import type { TablesUpdate } from '@/lib/database.types'
import { useBack } from '@/lib/navigation'
import { AppBar, Card, Icon, type IconProps, Screen } from '@/ui'

/** The `connect_*` half of `user_settings`: intent, not OS permission. */
type ConnectionKey = keyof Pick<
  TablesUpdate<'user_settings'>,
  | 'connect_watch'
  | 'connect_phone_health'
  | 'connect_running_app'
  | 'connect_smart_scale'
  | 'auto_sync'
  | 'wifi_only'
>

type Source = {
  key: ConnectionKey
  icon: IconProps
  title: string
  connectedDetail?: string
}

/** U3 CONNECTED */
export default function ConnectedScreen() {
  const { t } = useTranslation(['profile', 'common'])
  const goBack = useBack('/me')
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const toggle = (key: ConnectionKey, value: boolean) => updateSettings.mutate({ [key]: value })
  const isOn = (key: ConnectionKey) => Boolean(settings?.[key])

  const sources: Source[] = [
    {
      key: 'connect_watch',
      icon: { set: 'system', name: 'watch' },
      title: t('connected.watch'),
      connectedDetail: t('connected.watchSynced', { minutes: 2 }),
    },
    {
      key: 'connect_phone_health',
      icon: { set: 'system', name: 'phone' },
      title: t('connected.phone'),
      connectedDetail: t('connected.phoneDetail'),
    },
    {
      key: 'connect_running_app',
      icon: { set: 'body', name: 'running-shoe' },
      title: t('connected.running'),
    },
    {
      key: 'connect_smart_scale',
      icon: { set: 'body', name: 'weighing-scale' },
      title: t('connected.scale'),
    },
  ]

  return (
    <Screen>
      <AppBar
        title={t('connected.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      {sources.map((source) => (
        <Card key={source.key}>
          <ToggleRow
            title={source.title}
            description={isOn(source.key) ? source.connectedDetail : t('connected.notConnected')}
            value={isOn(source.key)}
            onValueChange={(value) => toggle(source.key, value)}
            leading={<Icon {...source.icon} size={40} />}
            divider={false}
          />
        </Card>
      ))}

      <Card title={t('connected.sync')} contentClassName="gap-0">
        <ToggleRow
          title={t('connected.autoSync')}
          value={isOn('auto_sync')}
          onValueChange={(value) => toggle('auto_sync', value)}
        />
        <ToggleRow
          title={t('connected.wifiOnly')}
          value={isOn('wifi_only')}
          onValueChange={(value) => toggle('wifi_only', value)}
          divider={false}
        />
      </Card>
    </Screen>
  )
}
