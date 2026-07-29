import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { useAppState } from '@/mock'
import { Button, EmptyState, Screen } from '@/ui'

/**
 * Anything the router cannot match.
 *
 * A deep link can arrive for a route that has been renamed, or that a build
 * this old does not have. Without this file expo-router shows its own
 * development screen, which in a release build is a dead end.
 */
export default function NotFound() {
  const { t } = useTranslation('common')
  const router = useRouter()
  const onboarded = useAppState((state) => state.onboarded)

  return (
    <Screen scroll={false} contentClassName="justify-center">
      <EmptyState
        title={t('notFound.title')}
        description={t('notFound.body')}
        icon={{ set: 'ui', name: 'warning' }}
        action={
          <Button onPress={() => router.replace(onboarded ? '/today' : '/welcome')}>
            {t('notFound.action')}
          </Button>
        }
      />
    </Screen>
  )
}
