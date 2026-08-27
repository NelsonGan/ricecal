import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useSession } from '@/data'
import { deleteAccount } from '@/data/auth'
import { openManageSubscriptions } from '@/data/purchases'
import { usePlanSummary } from '@/features/paywall'
import { SettingRow } from '@/features/shared'
import { openLegal, PRIVACY_URL, TERMS_URL } from '@/lib/legal'
import { useBack } from '@/lib/navigation'
import { AppBar, Button, Card, ConfirmSheet, Screen, Text, useToast } from '@/ui'

/**
 * U9 ACCOUNT
 *
 * One screen, and it exists for one paragraph of App Review guideline 5.1.1(v):
 * an app that lets somebody create an account has to let them delete it from
 * inside the app. Not a form, not an email, not a reply from a person. This app
 * was rejected for having only the email route, which
 * `ricecal.app/data-deletion` used to describe.
 *
 * WHY IT IS ITS OWN ROUTE rather than a row at the foot of the Me tab. A
 * reviewer has to be able to FIND it, working from the guideline text alone and
 * nothing else, and "Account" is the word they will look under. It is also the
 * only screen in settings that is about the account rather than about the
 * diary, so it is where the address belongs too.
 *
 * TWO STEPS, WHICH IS THE MOST THE GUIDELINE ALLOWS. A button, then a sheet
 * that says the thing cannot be undone. Anything beyond that — a typed
 * confirmation, a reason, a cooling-off period — is friction the guideline
 * reads as an obstacle, and none of it would prevent a mis-tap that two taps
 * and a red button do not.
 *
 * WHAT IT DOES NOT DO IS BARGAIN. No offer of a discount, no "are you sure you
 * want to lose your streak", no survey. Somebody who came here came here.
 */
export default function AccountScreen() {
  const { t } = useTranslation(['profile', 'common'])
  const goBack = useBack('/me')
  const toast = useToast()

  const { session } = useSession()
  const plan = usePlanSummary()
  const [confirming, setConfirming] = useState(false)

  /**
   * The failure stays on this screen and the success does not.
   *
   * A completed delete signs the session out, and `settings/_layout.tsx` sends
   * an account-less session to the welcome screen a tick later — so the toast
   * has to come from a provider that outlives the navigator, which
   * `ToastProvider` does. On a failure nothing has been deleted and nothing has
   * moved, so the same toast lands on this screen with the button still under
   * it.
   */
  const remove = async () => {
    try {
      await deleteAccount()
      toast.show({ title: t('profile:account.done') })
    } catch {
      toast.show({ title: t('profile:account.failed'), tone: 'error' })
    }
  }

  return (
    <Screen>
      <AppBar
        title={t('profile:account.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      {/* The address, because this is the screen about the account and because
          somebody about to delete one should be able to see WHICH one. A
          provider that gave us no address (Apple's private relay declined)
          leaves the card off rather than printing a blank label. */}
      {session?.user.email ? (
        <Card title={t('profile:account.signedInAs')}>
          <Text variant="bodyStrong">{session.user.email}</Text>
        </Card>
      ) : null}

      {/* The two documents, reachable from inside the app rather than only from
          App Store Connect. `PurchaseTerms` puts the same pair on every screen
          that can charge somebody (guideline 3.1.2); this is where they live
          for everyone else, and it is the screen a reader looking for what we
          hold would think to open. */}
      <Card title={t('profile:account.legalTitle')} contentClassName="gap-0">
        <SettingRow
          icon={{ set: 'system', name: 'shield' }}
          title={t('profile:account.privacy')}
          onPress={() => openLegal(PRIVACY_URL)}
        />
        <SettingRow
          icon={{ set: 'system', name: 'guide-book' }}
          title={t('profile:account.terms')}
          divider={false}
          onPress={() => openLegal(TERMS_URL)}
        />
      </Card>

      <Card title={t('profile:account.deleteTitle')}>
        <Text variant="body">{t('profile:account.deleteBody')}</Text>

        {/* Four lines, no ticks and no icons. This is a list of what will be
            destroyed, and the design system's `CheckList` is the "what you get"
            list — a green tick beside "Every photograph you took" reads as a
            promise rather than a warning. */}
        <View className="gap-1.5 pt-1">
          <Text variant="body">{t('profile:account.goesDiary')}</Text>
          <Text variant="body">{t('profile:account.goesPhotos')}</Text>
          <Text variant="body">{t('profile:account.goesRecipes')}</Text>
          <Text variant="body">{t('profile:account.goesProfile')}</Text>
        </View>

        {/* Only for somebody who actually has one. Billing lives with Apple or
            Google, so deleting the account here stops nothing there, and we
            cannot cancel on their behalf — `renews` is false for lifetime and
            for a promotional grant, which have nothing to cancel. */}
        {plan.renews ? (
          <View className="gap-2 pt-2">
            <Text variant="meta">{t('profile:account.cancelFirst')}</Text>
            <Button variant="secondary" fullWidth onPress={() => openManageSubscriptions()}>
              {t('profile:subscription.manage')}
            </Button>
          </View>
        ) : null}

        <Button variant="danger" fullWidth className="mt-2" onPress={() => setConfirming(true)}>
          {t('profile:account.action')}
        </Button>
      </Card>

      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={remove}
        title={t('profile:account.confirmTitle')}
        description={t('profile:account.confirmBody')}
        confirmLabel={t('common:action.delete')}
        cancelLabel={t('common:action.cancel')}
      />
    </Screen>
  )
}
