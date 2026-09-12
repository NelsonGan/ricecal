import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
import { AppBar, Screen, useToast } from '@/ui'

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
  const storeActionInFlight = useRef(false)
  const [purchasingPlan, setPurchasingPlan] = useState<Plan | null>(null)
  const [restoring, setRestoring] = useState(false)

  // Seeing the price resets the standing offer's clock, however the user got
  // here. Without it, somebody refused at the shutter on Monday would meet the
  // same page unprompted on Wednesday having already read it.
  useMarkPaywallSeen()

  const start = async (plan: Plan) => {
    // A card is a purchase button now. Guard the gap before React can disable
    // the other cards, or two fast taps can open two store requests.
    if (storeActionInFlight.current) return
    if (!purchasesAvailable()) {
      toast.show({ title: t('paywall:hard.notConfigured'), tone: 'warning' })
      return
    }
    storeActionInFlight.current = true
    setPurchasingPlan(plan)
    try {
      trackPurchaseStarted('hard', plan)
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
    } finally {
      storeActionInFlight.current = false
      setPurchasingPlan(null)
    }
  }

  const restore = async () => {
    // Restore opens the same store SDK as purchase. It shares the synchronous
    // guard so a fast tap cannot start both before React disables the controls.
    if (storeActionInFlight.current) return
    if (!purchasesAvailable()) {
      track('Restore Requested', { outcome: 'unavailable' })
      toast.show({ title: t('paywall:hard.notConfigured'), tone: 'warning' })
      return
    }
    storeActionInFlight.current = true
    setRestoring(true)
    try {
      const restored = await restorePurchases()
      track('Restore Requested', { outcome: restored ? 'restored' : 'nothing' })
      if (!restored) {
        toast.show({ title: t('paywall:hard.nothingToRestore') })
        return
      }
      // Same race as a fresh purchase: the store knows, our mirror does not yet.
      await awaitEntitlement()
      toast.show({ title: t('paywall:hard.restored'), tone: 'success' })
    } catch (error) {
      toast.show({
        title: error instanceof Error ? error.message : t('common:action.retry'),
        tone: 'error',
      })
    } finally {
      storeActionInFlight.current = false
      setRestoring(false)
    }
  }

  return (
    <Screen>
      <AppBar
        title={t('paywall:hard.appBar')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      <ProPitch
        mode="purchase"
        onPlanPurchase={start}
        onRestore={restore}
        purchasingPlan={purchasingPlan}
        restoring={restoring}
      />
    </Screen>
  )
}
