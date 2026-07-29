import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { CheckList } from '@/features/shared'
import { progressOf, useAppState, useDispatch } from '@/mock'
import { AppBar, Button, Card, ConfirmSheet, Icon, ProgressBar, Screen, Text, useToast } from '@/ui'

const TRIAL_DAYS = 3

/** U6 SUBSCRIPTION */
export default function SubscriptionScreen() {
  const { t } = useTranslation(['profile', 'paywall', 'common'])
  const router = useRouter()
  const dispatch = useDispatch()
  const toast = useToast()
  const subscription = useAppState((state) => state.subscription)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const yearly = subscription.plan === 'yearly'

  const switchPlan = () => {
    dispatch({
      type: 'setSubscription',
      status: subscription.status,
      plan: yearly ? 'monthly' : 'yearly',
    })
    toast.show({ title: t('profile:subscription.switched'), tone: 'success' })
  }

  const cancel = () => {
    dispatch({ type: 'setSubscription', status: 'expired' })
    setConfirmCancel(false)
    router.replace('/paywall/ended')
  }

  return (
    <Screen
      footer={
        <Button variant="neutral" fullWidth onPress={switchPlan}>
          {yearly
            ? t('profile:subscription.switchMonthly')
            : t('profile:subscription.switchYearly')}
        </Button>
      }
    >
      <AppBar title={t('profile:subscription.title')} onBack={() => router.back()} />

      <Card>
        <View className="flex-row items-center gap-3">
          <Icon set="system" name="crown" size={50} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="subtitle">{t('profile:subscription.pro')}</Text>
            <Text variant="meta">
              {t('profile:subscription.trialLeft', { count: subscription.trialDaysLeft })}
            </Text>
          </View>
        </View>

        <ProgressBar
          value={progressOf(TRIAL_DAYS - subscription.trialDaysLeft, TRIAL_DAYS)}
          tone="kaya"
          height={11}
          accessibilityLabel={t('profile:subscription.title')}
        />

        <Text variant="meta">
          {t('profile:subscription.renews', {
            price: yearly ? t('paywall:hard.yearlyPrice') : t('paywall:hard.monthlyPrice'),
          })}
        </Text>
      </Card>

      <Card title={t('profile:subscription.yourPlan')}>
        <Row label={t('profile:subscription.plan')} value={t('profile:subscription.planPrice')} />
        <Row
          label={t('profile:subscription.perMonth')}
          value={t('profile:subscription.perMonthPrice')}
        />
        <Row
          label={t('profile:subscription.payment')}
          value={t('profile:subscription.paymentValue', { last4: subscription.cardLast4 })}
        />
      </Card>

      <Card title={t('profile:subscription.included')}>
        <CheckList
          items={[
            t('profile:subscription.perks.unlimited'),
            t('profile:subscription.perks.scanning'),
            t('profile:subscription.perks.database'),
            t('profile:subscription.perks.sync'),
          ]}
        />
      </Card>

      <Button variant="ghost" fullWidth onPress={() => setConfirmCancel(true)}>
        {t('profile:subscription.cancel')}
      </Button>

      <ConfirmSheet
        visible={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={cancel}
        title={t('profile:subscription.cancelTitle')}
        description={t('profile:subscription.cancelBody')}
        confirmLabel={t('profile:subscription.cancelConfirm')}
        tone="danger"
      />
    </Screen>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text variant="label">{label}</Text>
      <Text variant="meta">{value}</Text>
    </View>
  )
}
