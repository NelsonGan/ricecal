import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserId } from '@/data'
import { useSocialConnections, useSocialOnline } from '@/data/social'
import { PersonRow, SocialBar, SocialList, useSocialTask } from '@/features/social/components'
import { Button, ConfirmSheet, Screen } from '@/ui'

export default function ConnectionsScreen() {
  const params = useLocalSearchParams<{ id: string; direction: string }>()
  const direction = params.direction === 'following' ? 'following' : 'followers'
  return <Connections key={`${params.id}/${direction}`} id={params.id} direction={direction} />
}

function Connections({ id, direction }: { id: string; direction: 'followers' | 'following' }) {
  const { t } = useTranslation('social')
  const viewer = useUserId()
  const people = useSocialConnections(id, direction)
  const action = useSocialTask()
  const online = useSocialOnline()
  const [removing, setRemoving] = useState<string | null>(null)
  return (
    <Screen scroll={false} flush header={<SocialBar title={t(direction)} />}>
      <SocialList
        query={people}
        rowKey={(person) => person.user_id}
        renderRow={(person, visible) => (
          <PersonRow
            person={person}
            visible={visible}
            trailing={
              id === viewer && direction === 'followers' ? (
                <Button
                  size="sm"
                  variant="neutral"
                  disabled={!online}
                  onPress={() => setRemoving(person.user_id)}
                >
                  {t('removeFollower')}
                </Button>
              ) : undefined
            }
          />
        )}
        empty={t('emptyConnections')}
      />
      <ConfirmSheet
        visible={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={t('removeFollower')}
        description={t('removeFollowerBody')}
        confirmLabel={t('removeFollower')}
        cancelLabel={t('cancel')}
        onConfirm={async () => {
          if (removing) await action.run({ action: 'removeFollower', id: removing })
        }}
      />
    </Screen>
  )
}
