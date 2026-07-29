import { useTranslation } from 'react-i18next'
import { ToggleRow } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { type Connections, useAppState, useDispatch } from '@/mock'
import { AppBar, Card, Icon, type IconProps, Screen } from '@/ui'

type Source = {
  key: keyof Connections
  icon: IconProps
  title: string
  connectedDetail?: string
}

/** U3 CONNECTED */
export default function ConnectedScreen() {
  const { t } = useTranslation(['profile', 'common'])
  const goBack = useBack('/me')
  const dispatch = useDispatch()
  const connections = useAppState((state) => state.connections)

  const sources: Source[] = [
    {
      key: 'watch',
      icon: { set: 'system', name: 'watch' },
      title: t('connected.watch'),
      connectedDetail: t('connected.watchSynced', { minutes: 2 }),
    },
    {
      key: 'phoneHealth',
      icon: { set: 'system', name: 'phone' },
      title: t('connected.phone'),
      connectedDetail: t('connected.phoneDetail'),
    },
    {
      key: 'runningApp',
      icon: { set: 'body', name: 'running-shoe' },
      title: t('connected.running'),
    },
    {
      key: 'smartScale',
      icon: { set: 'body', name: 'weighing-scale' },
      title: t('connected.scale'),
    },
  ]

  const set = (patch: Partial<Connections>) => dispatch({ type: 'setConnections', patch })

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
            description={
              connections[source.key] ? source.connectedDetail : t('connected.notConnected')
            }
            value={connections[source.key]}
            onValueChange={(value) => set({ [source.key]: value })}
            leading={<Icon {...source.icon} size={40} />}
            divider={false}
          />
        </Card>
      ))}

      <Card title={t('connected.sync')} contentClassName="gap-0">
        <ToggleRow
          title={t('connected.autoSync')}
          value={connections.autoSync}
          onValueChange={(autoSync) => set({ autoSync })}
        />
        <ToggleRow
          title={t('connected.wifiOnly')}
          value={connections.wifiOnly}
          onValueChange={(wifiOnly) => set({ wifiOnly })}
          divider={false}
        />
      </Card>
    </Screen>
  )
}
