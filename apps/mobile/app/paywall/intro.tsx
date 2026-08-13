import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Plan, useAwaitEntitlement, usePlanPrices } from '@/data'
import {
  isUserCancelled,
  PurchasesUnavailable,
  purchasePlan,
  purchasesAvailable,
  restorePurchases,
} from '@/data/purchases'
import { CheckList, PlanPicker } from '@/features/shared'
import { Button, Icon, Screen, Text, useToast } from '@/ui'

const MASCOT = require('../../assets/brand/mascot.png')

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
  const { data: prices } = usePlanPrices()

  const lifetime = plan === 'lifetime'

  const start = async () => {
    if (!purchasesAvailable()) {
      // Not silently skipped to Today. A build with no store attached should
      // say so, or this reads as a dead button.
      toast.show({ title: t('paywall:hard.notConfigured'), tone: 'warning' })
      return
    }
    try {
      await purchasePlan(plan)
      // The store has confirmed; our own mirror of it has not yet. See
      // `useAwaitEntitlement` — leaving on the store's word alone can put
      // the paywall back in front of somebody who has just paid.
      await awaitEntitlement()
      router.replace({ pathname: '/paywall/welcome', params: { plan: plan } })
    } catch (error) {
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

  const priceString = prices?.[plan]?.priceString
  const smallPrint = !priceString
    ? t('paywall:hard.smallPrintPending')
    : plan === 'lifetime'
      ? t('paywall:hard.smallPrintLifetime', { price: priceString })
      : plan === 'yearly'
        ? t('paywall:hard.smallPrintYearly', { price: priceString })
        : t('paywall:hard.smallPrintMonthly', { price: priceString })

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
              user went. */}
          <Button variant="ghost" fullWidth onPress={() => router.replace('/today')}>
            {t('paywall:intro.later')}
          </Button>
          <Button variant="ghost" fullWidth onPress={restore}>
            {t('paywall:hard.restore')}
          </Button>
        </View>
      }
    >
      <View className="items-center gap-2.5">
        <Image source={MASCOT} style={{ width: 72, height: 72 }} contentFit="contain" />
        <Text variant="title" className="text-center">
          {t('paywall:intro.title')}
        </Text>
        <Text variant="meta" className="text-center">
          {t('paywall:intro.body')}
        </Text>
      </View>

      <CheckList
        items={[
          t('paywall:hard.perks.unlimited'),
          t('paywall:hard.perks.scanning'),
          t('paywall:hard.perks.database'),
        ]}
      />

      <PlanPicker showLifetime value={plan} onChange={setPlan} />

      <View className="items-center gap-1.5">
        <View className="flex-row items-center gap-2">
          <Icon set="system" name="shield" size={16} />
          <Text variant="caption" className="text-pandan-ink">
            {t('paywall:hard.assurance')}
          </Text>
        </View>
        <Text variant="caption" className="text-center text-faint">
          {/* The sentence needs the number, so it waits for it rather than
              printing half of itself. */}
          {smallPrint}
        </Text>
        <Text variant="caption" className="text-center text-faint">
          {t('paywall:intro.laterNote')}
        </Text>
      </View>
    </Screen>
  )
}
