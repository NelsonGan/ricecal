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
  useTrackPaywallShown,
} from '@/features/paywall'
import { track } from '@/lib/analytics'
import { useEnterApp } from '@/lib/navigation'
import { Button, Screen, useToast } from '@/ui'

/**
 * The paywall at the end of onboarding. The tour hands over to this rather than
 * to Today, so the offer is made once, at the moment the user has answered the
 * questions, seen their budget and been told how logging works.
 *
 * "Later" is a real way out. It lands on the actual app: everything reads, search
 * works, the catalogue is open, and the only thing behind the wall is writing an
 * entry. There is no close chevron, because a modal presented over nothing has
 * nothing to go back to.
 *
 * The three plans are all offered here, unlike the feature gates, because this is
 * the one screen with room to weigh them up. Lifetime has no trial, so the button
 * and the small print both change when it is selected: a "start free trial" over
 * a one-off purchase would be a promise the store does not keep.
 */
export default function IntroPaywall() {
  const { t } = useTranslation(['paywall', 'common'])
  const router = useRouter()
  const enterApp = useEnterApp()
  const toast = useToast()
  const awaitEntitlement = useAwaitEntitlement()
  const [plan, setPlan] = useState<Plan>('yearly')

  useTrackPaywallShown('intro')

  const lifetime = plan === 'lifetime'

  const start = async () => {
    if (!purchasesAvailable()) {
      // Not silently skipped to Today. A build with no store attached should
      // say so, or this reads as a dead button.
      toast.show({ title: t('paywall:hard.notConfigured'), tone: 'warning' })
      return
    }
    trackPurchaseStarted('intro', plan)
    try {
      await purchasePlan(plan)
      // Nothing on success: RevenueCat reports the transaction itself.
      //
      // The store has confirmed; our own mirror of it has not yet. See
      // `useAwaitEntitlement` — leaving on the store's word alone can put
      // the paywall back in front of somebody who has just paid.
      await awaitEntitlement()
      router.replace({ pathname: '/paywall/welcome', params: { plan: plan } })
    } catch (error) {
      trackPurchaseAbandoned('intro', plan, error)
      // Closing the store's sheet is not a failure worth apologising for; the
      // user did it deliberately and knows what happened.
      if (isUserCancelled(error)) return
      // And a build with no usable SDK should say so rather than go quiet,
      // which is what this branch did when it swallowed the error.
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
            {lifetime ? t('paywall:hard.startLifetime') : t('paywall:hard.start')}
          </Button>
          {/* Not a push. This screen replaced the tour, and the tour replaced
              the questions, so there is nothing underneath worth keeping — and
              Today is where the app IS rather than somewhere the user went.

              A `replace` was not enough to say that, because "the questions"
              are not one entry. The account step crosses out of the onboarding
              group and back, so the screens walked before it are a root entry
              of their own that a replace of THIS one leaves behind: the diary
              came up standing on "Get started". `enterApp` unwinds the lot.

              Two buttons here, and only two. Restore used to be a third
              full-width control pinned under this one, which read as a way
              FORWARD from this screen rather than as the hatch it is. It is a
              link at the foot of the page now, under the small print. */}
          <Button variant="ghost" fullWidth onPress={() => enterApp()}>
            {t('paywall:intro.later')}
          </Button>
        </View>
      }
    >
      <ProPitch
        plan={plan}
        onRestore={restore}
        onPlanChange={(next) => {
          // Only a CHANGE. Tapping the card that is already selected is a real
          // press and no decision, and counting it would inflate the one figure
          // on this screen that is meant to say which plan people move to.
          if (next !== plan) track('Plan Selected', { screen: 'intro', plan: next })
          setPlan(next)
        }}
      />
    </Screen>
  )
}
