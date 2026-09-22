import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSocialBlocked, useSocialOnline } from '@/data/social'
import { PersonRow, SocialBar, SocialList, useSocialTask } from '@/features/social/components'
import { Button, ConfirmSheet, Screen } from '@/ui'

export default function BlockedScreen() {
  const { t } = useTranslation('social')
  const people = useSocialBlocked()
  const action = useSocialTask()
  const online = useSocialOnline()
  const [unblocking, setUnblocking] = useState<string | null>(null)
  return (
    <Screen scroll={false} flush header={<SocialBar title={t('blocked')} />}>
      <SocialList
        query={people}
        rowKey={(person) => person.user_id}
        variant="rows"
        renderRow={(person, visible) => (
          <PersonRow
            person={person}
            visible={visible}
            trailing={
              <Button
                size="sm"
                variant="neutral"
                disabled={!online}
                onPress={() => setUnblocking(person.user_id)}
              >
                {t('unblock')}
              </Button>
            }
          />
        )}
        empty={t('emptyBlocked')}
      />
      <ConfirmSheet
        visible={Boolean(unblocking)}
        onClose={() => setUnblocking(null)}
        title={t('unblock')}
        description={t('unblockBody')}
        confirmLabel={t('unblock')}
        cancelLabel={t('cancel')}
        onConfirm={async () => {
          if (unblocking) await action.run({ action: 'unblock', id: unblocking })
        }}
      />
    </Screen>
  )
}
