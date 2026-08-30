import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { onSessionEnded } from '@/lib/supabase'
import { useToast } from '@/ui'

/**
 * Says why the app just signed somebody out who did not ask to be. Renders
 * nothing, like `LoginLinkHandler` beside it: a revoked session is discovered by
 * whichever request happened to be in flight, so there is nothing to hang this
 * off but the tree.
 *
 * It sits under `ToastProvider` for the reason that provider sits outside the
 * navigator: the sign-out empties the cache and the layout guards throw the user
 * out a tick later, so a message belonging to their screen would go with it.
 *
 * `placement: 'top'`, like a refusal, since every screen it can land on keeps its
 * call to action in a footer.
 */
export function SessionEndedNotice() {
  const toast = useToast()
  const { t } = useTranslation('auth')

  useEffect(
    () =>
      onSessionEnded(() => {
        toast.show({
          title: t('ended.title'),
          description: t('ended.body'),
          tone: 'error',
          placement: 'top',
        })
      }),
    [toast, t],
  )

  return null
}
