import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { onSessionEnded } from '@/lib/supabase'
import { useToast } from '@/ui'

/**
 * Says why the app just signed somebody out that did not ask to be.
 *
 * Renders nothing; it is here for the side effect, like `LoginLinkHandler` next
 * to it. A revoked session is discovered by whichever request happened to be in
 * flight, which is any request on any screen, so there is nothing to hang this
 * off but the tree itself.
 *
 * It sits under `ToastProvider` for the reason that provider sits outside the
 * navigator: the sign-out empties the query cache and the layout guards throw
 * the user out to sign-in a tick later, so a message that belonged to the screen
 * they were on would go with it. The sentence has to outlive the navigation,
 * because being put back on the sign-in screen unannounced is the whole
 * complaint.
 *
 * `placement: 'top'`, same as a refusal. Every screen it can land on keeps its
 * call to action in a footer, and the bottom is where a toast goes by default.
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
