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
import {
  ProPitch,
  trackPurchaseAbandoned,
  trackPurchaseStarted,
  useMarkPaywallSeen,
} from '@/features/paywall'
import { track } from '@/lib/analytics'
import { useBack } from '@/lib/navigation'
import { AppBar, Button, Screen, useToast } from '@/ui'

/**
 * The paywall.
 *
 * A full page, not a modal, by the app's own rule: a modal is something you
 * answer and dismiss and carries a cross; a page is somewhere you go and come
 * back from and carries a chevron. This has ten features, three plans and small
 * print on it, and it is reached from somewhere worth returning to.
 *
 * The sales half is `ProPitch`, shared with the onboarding paywall. What differs
 * between the two is how you leave, and that is all that lives here.
 */
export default function Paywall() {
  const { t } = useTranslation(['paywall', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const toast = useToast()
  const awaitEntitlement = useAwaitEntitlement()
  const [plan, setPlan] = useState<Plan>('yearly')

  // Seeing the price resets the standing offer's clock, however the user got
  // here. Without it, somebody refused at the shutter on Monday would meet the
  // same page unprompted on Wednesday having already read it.
  useMarkPaywallSeen()

  const start = async () => {
    if (!purchasesAvailable()) {
      toast.show({ title: t('paywall:hard.notConfigured'), tone: 'warning' })
      return
    }
    trackPurchaseStarted('hard', plan)
    try {
      await purchasePlan(plan)
      // Nothing is tracked on success: RevenueCat's own webhook reports the
      // transaction, and it is the only party that knows the store settled it.
      //
      // The store has confirmed; our own mirror of it has not yet. See
      // `useAwaitEntitlement` — leaving on the store's word alone can put the
      // paywall back in front of somebody who has just paid.
      await awaitEntitlement()
      router.replace({ pathname: '/paywall/welcome', params: { plan } })
    } catch (error) {
      trackPurchaseAbandoned('hard', plan, error)
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
      track('Restore Requested', { outcome: 'unavailable' })
      toast.show({ title: t('paywall:hard.notConfigured'), tone: 'warning' })
      return
    }
    const restored = await restorePurchases()
    track('Restore Requested', { outcome: restored ? 'restored' : 'nothing' })
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

      <ProPitch
        plan={plan}
        onPlanChange={(next) => {
          // Only a CHANGE. Tapping the card that is already selected is a real
          // press and no decision, and counting it would inflate the one figure
          // on this screen that is meant to say which plan people move to.
          if (next !== plan) track('Plan Selected', { screen: 'hard', plan: next })
          setPlan(next)
        }}
      />
    </Screen>
  )
}
