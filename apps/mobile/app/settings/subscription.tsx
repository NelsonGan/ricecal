import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useAiUsage, useSubscription } from '@/data'
import { openManageSubscriptions } from '@/data/purchases'
import { CheckList } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { progressOf } from '@/lib/nutrition'
import { AppBar, Button, Card, ConfirmSheet, Icon, ProgressBar, Screen, Text } from '@/ui'

/** Matches the introductory offer on both stores: ONE_WEEK / P7D. */
const TRIAL_DAYS = 7

/** U6 SUBSCRIPTION */
export default function SubscriptionScreen() {
  const { t } = useTranslation(['profile', 'paywall', 'common'])
  const goBack = useBack('/me')
  const { data: subscription } = useSubscription()
  const { data: usage } = useAiUsage()
  const [confirmCancel, setConfirmCancel] = useState(false)

  const yearly = subscription?.plan === 'yearly'
  // A one-off purchase has no period, no renewal and nothing to switch to, so
  // three things on this screen have to say something else.
  const lifetime = subscription?.plan === 'lifetime'

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
          {lifetime
            ? t('profile:subscription.manage')
            : yearly
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

        {/* Only during a trial. Drawn unconditionally it read as a full bar for
            everybody else, because `trialDaysLeft` is 0 when there is no trial
            to be left of — which told a paying subscriber their trial was
            spent, and told somebody who had bought LIFETIME the same thing
            about a trial they never had. */}
        {subscription?.status === 'trial' ? (
          <ProgressBar
            value={progressOf(TRIAL_DAYS - trialDaysLeft, TRIAL_DAYS)}
            tone="kaya"
            height={11}
            accessibilityLabel={t('profile:subscription.title')}
          />
        ) : null}

        <Text variant="meta">
          {lifetime
            ? t('profile:subscription.neverRenews')
            : t('profile:subscription.renews', {
                price: yearly ? t('paywall:plans.yearlyPrice') : t('paywall:plans.monthlyPrice'),
              })}
        </Text>
      </Card>

      <Card title={t('profile:subscription.yourPlan')}>
        <Row
          label={t('profile:subscription.plan')}
          value={
            lifetime
              ? t('paywall:plans.lifetime')
              : yearly
                ? t('paywall:plans.yearly')
                : t('paywall:plans.monthly')
          }
        />
        <Row
          label={t('profile:subscription.perMonth')}
          value={
            lifetime
              ? t('paywall:plans.lifetimePrice')
              : yearly
                ? t('paywall:plans.yearlyPerMonth')
                : t('paywall:plans.monthlyPrice')
          }
        />
        {/* The store holds the card, and never tells us anything about it.
            What it does tell us is which store the purchase came from. */}
        <Row
          label={t('profile:subscription.payment')}
          value={subscription?.store ?? t('profile:subscription.paymentUnknown')}
        />
      </Card>

      {/* The monthly ceiling, with the number on it. The toast that announces
          the limit deliberately does not name it — it counts REQUESTS, not
          meals, and a bare figure invites an argument the toast cannot win.
          This is the screen with room for the sentence underneath. */}
      {usage ? (
        <Card title={t('paywall:limit.title')}>
          <View className="gap-2">
            <Row
              label={t('paywall:limit.used')}
              value={t('paywall:limit.usage', {
                used: usage.used.toLocaleString(),
                limit: usage.monthlyLimit.toLocaleString(),
              })}
            />
            <ProgressBar
              value={progressOf(usage.used, usage.monthlyLimit)}
              tone="pandan"
              height={11}
              accessibilityLabel={t('paywall:limit.title')}
            />
            <Text variant="meta">{t('paywall:limit.note')}</Text>
          </View>
        </Card>
      ) : null}

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
