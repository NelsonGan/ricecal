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
import { Button, Screen, useToast } from '@/ui'

/**
 * THE PAYWALL AT THE END OF ONBOARDING.
 *
 * The tour hands over to this rather than to Today, so the offer is made once,
 * at the moment the user is most ready to hear it: they have answered the
 * questions, seen their budget and been told how logging works, and the next
 * thing they were going to do is log something.
 *
 * "LATER" IS A REAL WAY OUT and not a dark pattern in reverse. It lands on the
 * actual app, not a preview of one — everything reads, search works, the
 * catalogue is open, and the only thing behind the wall is writing an entry.
 * A user who declines here is not stuck on a sales page, and the app they walk
 * into is the honest version of what they would be buying.
 *
 * There is no close chevron. A modal presented over nothing has nothing to go
 * back to, and the ghost button says plainly what it does.
 *
 * The three plans are all offered here, unlike the feature gates, because this
 * is the one screen with room to weigh them up. Lifetime has no trial, so the
 * button and the small print both change when it is selected — a "start free
 * trial" over a one-off purchase would be a promise the store does not keep.
 */
export default function IntroPaywall() {
  const { t } = useTranslation(['paywall', 'common'])
  const router = useRouter()
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
          {/* `replace`, not `push`. This screen replaced the tour, and the tour
              replaced the questions, so there is nothing underneath worth
              keeping — and Today is where the app IS rather than somewhere the
              user went.

              Two buttons here, and only two. Restore used to be a third
              full-width control pinned under this one, which read as a way
              FORWARD from this screen rather than as the hatch it is. It is a
              link at the foot of the page now, under the small print. */}
          <Button variant="ghost" fullWidth onPress={() => router.replace('/today')}>
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
