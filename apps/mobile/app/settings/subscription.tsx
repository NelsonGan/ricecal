import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useSubscription } from '@/data'
import { openManageSubscriptions } from '@/data/purchases'
import { CheckList } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { progressOf } from '@/lib/nutrition'
import { AppBar, Button, Card, ConfirmSheet, Icon, ProgressBar, Screen, Text } from '@/ui'

const TRIAL_DAYS = 3

/** U6 SUBSCRIPTION */
export default function SubscriptionScreen() {
  const { t } = useTranslation(['profile', 'paywall', 'common'])
  const goBack = useBack('/me')
  const { data: subscription } = useSubscription()
  const [confirmCancel, setConfirmCancel] = useState(false)

  const yearly = subscription?.plan === 'yearly'

  // Whole days left, from the instant the store reported. Not a stored counter:
  // one would need something to decrement it every midnight.
  const trialDaysLeft = subscription?.trial_ends_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(subscription.trial_ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
        ),
      )
    : 0

  // Both of these leave the app. The payment relationship is with the store,
  // and Apple and Google both require cancellation to happen there — the app
  // could not do it even if it wanted to.
  const switchPlan = () => openManageSubscriptions()

  const cancel = () => {
    setConfirmCancel(false)
    openManageSubscriptions()
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
      <AppBar
        title={t('profile:subscription.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      <Card>
        <View className="flex-row items-center gap-3">
          <Icon set="system" name="crown" size={50} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="subtitle">{t('profile:subscription.pro')}</Text>
            <Text variant="meta">
              {subscription?.status === 'trial'
                ? t('profile:subscription.trialLeft', { count: trialDaysLeft })
                : subscription?.status === 'active'
                  ? t('profile:home.proActive')
                  : t('profile:home.proNone')}
            </Text>
          </View>
        </View>

        <ProgressBar
          value={progressOf(TRIAL_DAYS - trialDaysLeft, TRIAL_DAYS)}
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
        {/* The store holds the card, and never tells us anything about it.
            What it does tell us is which store the purchase came from. */}
        <Row
          label={t('profile:subscription.payment')}
          value={subscription?.store ?? t('profile:subscription.paymentUnknown')}
        />
      </Card>

      <Card title={t('profile:subscription.included')}>
        <CheckList
          items={[
            t('profile:subscription.perks.unlimited'),
            t('profile:subscription.perks.scanning'),
            t('profile:subscription.perks.database'),
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
