import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Plan, useAwaitEntitlement } from '@/data'
import {
  isUserCancelled,
  PurchasesUnavailable,
  purchasePlan,
  purchasesAvailable,
  restorePurchases,
} from '@/data/purchases'
import { ProPitch } from '@/features/paywall'
import { useBack } from '@/lib/navigation'
import { AppBar, Button, Screen, useToast } from '@/ui'

/**
 * W1 THE PAYWALL.
 *
 * A FULL PAGE, not a modal, and the app's own rule is why. A modal is
 * something you answer and dismiss — the quick selector, a confirmation — and
 * carries a cross; a page is somewhere you go and come back from, and carries
 * a chevron. This is a page. It has ten features, three plans and small print
 * on it, which is more than a sheet's worth, and it is reached from somewhere
 * worth returning to: the dish that was about to be logged, the recipe that
 * was about to be saved.
 *
 * The sales half is `ProPitch`, shared with the onboarding paywall. What
 * differs between the two is how you LEAVE, and that is all that lives here.
 */
export default function Paywall() {
  const { t } = useTranslation(['paywall', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const toast = useToast()
  const awaitEntitlement = useAwaitEntitlement()
  const [plan, setPlan] = useState<Plan>('yearly')

  const start = async () => {
    if (!purchasesAvailable()) {
      toast.show({ title: t('paywall:hard.notConfigured'), tone: 'warning' })
      return
    }
    try {
      await purchasePlan(plan)
      // The store has confirmed; our own mirror of it has not yet. See
      // `useAwaitEntitlement` — leaving on the store's word alone can put the
      // paywall back in front of somebody who has just paid.
      await awaitEntitlement()
      router.replace({ pathname: '/paywall/welcome', params: { plan } })
    } catch (error) {
      // Closing the store's sheet is not a failure worth apologising for; the
      // user did it deliberately and knows what happened.
      if (isUserCancelled(error)) return
      // And a build with no usable SDK should say so rather than go quiet.
      if (error instanceof PurchasesUnavailable) {
        toast.show({ title: t('paywall:hard.notConfigured'), tone: 'warning' })
        return
      }
      toast.show({
        title: error instanceof Error ? error.message : t('common:action.retry'),
        tone: 'error',
      })
    }
  }

  const restore = async () => {
    if (!purchasesAvailable()) {
      toast.show({ title: t('paywall:hard.notConfigured'), tone: 'warning' })
      return
    }
    const restored = await restorePurchases()
    if (!restored) {
      toast.show({ title: t('paywall:hard.nothingToRestore') })
      return
    }
    // Same race as a fresh purchase: the store knows, our mirror does not yet.
    await awaitEntitlement()
    toast.show({ title: t('paywall:hard.restored'), tone: 'success' })
  }

  return (
    <Screen
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={start}>
            {plan === 'lifetime' ? t('paywall:hard.startLifetime') : t('paywall:hard.start')}
          </Button>
          <Button variant="ghost" fullWidth onPress={restore}>
            {t('paywall:hard.restore')}
          </Button>
        </View>
      }
    >
      <AppBar
        title={t('paywall:hard.appBar')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      <ProPitch plan={plan} onPlanChange={setPlan} />
    </Screen>
  )
}
