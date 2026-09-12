import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { type Plan, useAwaitEntitlement, usePlanPrices } from '@/data'
import {
  isUserCancelled,
  PurchasesUnavailable,
  purchasePlan,
  purchasesAvailable,
  restorePurchases,
} from '@/data/purchases'
import { track } from '@/lib/analytics'
import { spacing } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Icon, IconButton, Screen, useToast } from '@/ui'
import { ProPitch } from './ProPitch'
import { ProWordmark } from './ProWordmark'
import { trackPurchaseAbandoned, trackPurchaseStarted } from './tracking'

export type PaywallOfferProps = {
  /** Kept only to attribute purchase analytics to the route that opened the offer. */
  screen: 'intro' | 'hard'
  /** Leaves without buying: enter the app after onboarding, or return from a gate. */
  onLater: () => void
}

/** The shared plan selection, purchase, and restore flow for both full paywalls. */
export function PaywallOffer(props: PaywallOfferProps) {
  const { t } = useTranslation(['paywall', 'common'])
  const router = useRouter()
  const toast = useToast()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const awaitEntitlement = useAwaitEntitlement()
  const { data: prices } = usePlanPrices()
  const [plan, setPlan] = useState<Plan>('yearly')
  const [storeAction, setStoreAction] = useState<'purchase' | 'restore' | null>(null)
  const storeActionInFlight = useRef(false)

  const selectPlan = (next: Plan) => {
    if (next === plan) return
    track('Plan Selected', { screen: props.screen, plan: next })
    setPlan(next)
  }

  const start = async () => {
    // State cannot disable a second tap in the same frame. The ref closes that
    // gap so two store sheets can never be requested for one visible button.
    if (storeActionInFlight.current) return
    if (!purchasesAvailable()) {
      toast.show({ title: t('paywall:hard.notConfigured'), tone: 'warning' })
      return
    }

    storeActionInFlight.current = true
    setStoreAction('purchase')
    try {
      trackPurchaseStarted(props.screen, plan)
      await purchasePlan(plan)
      // The store has confirmed; wait for the app's entitlement mirror before
      // leaving so the next screen cannot put the paywall straight back.
      await awaitEntitlement()
      router.replace({ pathname: '/paywall/welcome', params: { plan } })
    } catch (error) {
      trackPurchaseAbandoned(props.screen, plan, error)
      if (isUserCancelled(error)) return
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
      setStoreAction(null)
    }
  }

  const restore = async () => {
    if (storeActionInFlight.current) return
    if (!purchasesAvailable()) {
      track('Restore Requested', { outcome: 'unavailable' })
      toast.show({ title: t('paywall:hard.notConfigured'), tone: 'warning' })
      return
    }

    storeActionInFlight.current = true
    setStoreAction('restore')
    try {
      const restored = await restorePurchases()
      track('Restore Requested', { outcome: restored ? 'restored' : 'nothing' })
      if (!restored) {
        toast.show({ title: t('paywall:hard.nothingToRestore') })
        return
      }
      await awaitEntitlement()
      toast.show({ title: t('paywall:hard.restored'), tone: 'success' })
    } catch (error) {
      toast.show({
        title: error instanceof Error ? error.message : t('common:action.retry'),
        tone: 'error',
      })
    } finally {
      storeActionInFlight.current = false
      setStoreAction(null)
    }
  }

  const lifetime = plan === 'lifetime'
  const freeTrialEligible = prices?.[plan]?.freeTrialEligible === true
  const busy = storeAction !== null

  return (
    <View className="flex-1 bg-canvas">
      {/* One fixed header for both routes. The close control is positioned
          outside the centring calculation, so the wordmark stays at the
          screen's true midpoint while the offer below it scrolls. */}
      <View className="bg-canvas px-gutter" style={{ paddingTop: insets.top + spacing.sm }}>
        <View className="relative min-h-[44px] flex-row items-center justify-center">
          <ProWordmark />
          <IconButton
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0"
            accessibilityLabel={t('common:action.close')}
            onPress={props.onLater}
            disabled={busy}
          >
            <Icon set="ui" name="close" size={20} tintColor={colors.muted} />
          </IconButton>
        </View>
      </View>

      <Screen
        safeAreaTop={false}
        footer={
          <View className="-mb-sm gap-1.5">
            <Button fullWidth onPress={start} loading={storeAction === 'purchase'} disabled={busy}>
              {lifetime
                ? t('paywall:hard.startLifetime')
                : freeTrialEligible
                  ? t('paywall:hard.start')
                  : t('paywall:hard.startSubscription')}
            </Button>
            <Button variant="ghost" fullWidth onPress={props.onLater} disabled={busy}>
              {t('paywall:intro.later')}
            </Button>
          </View>
        }
      >
        <ProPitch plan={plan} onPlanChange={selectPlan} onRestore={restore} disabled={busy} />
      </Screen>
    </View>
  )
}
