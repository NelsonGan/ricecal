import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useEntitlement, usePlanPrices, useSubscription } from '@/data'
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
  const router = useRouter()
  const goBack = useBack('/me')
  const { data: subscription } = useSubscription()
  const { data: prices } = usePlanPrices()
  const [confirmCancel, setConfirmCancel] = useState(false)

  const yearly = subscription?.plan === 'yearly'
  // A one-off purchase has no period, no renewal and nothing to switch to, so
  // three things on this screen have to say something else.
  const lifetime = subscription?.plan === 'lifetime'

  /**
   * Somebody who has never paid, or whose subscription has lapsed.
   *
   * They reach this screen from the Me tab like everybody else, and until now
   * the only thing on it was "Switch to yearly" — which opens the store to
   * change a subscription that does not exist. This is also the ONLY way back
   * to `/paywall`: it used to be reachable from the read-only preview screen,
   * and when that went the standing paywall became a route nothing linked to.
   */
  // `useEntitlement`, not a second copy of the rule. It exists so that "what
  // does Pro include" is answered once; comparing statuses here would be the
  // screen that silently disagrees when that answer changes.
  const { entitled } = useEntitlement()

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
        entitled ? (
          <Button variant="neutral" fullWidth onPress={switchPlan}>
            {lifetime
              ? t('profile:subscription.manage')
              : yearly
                ? t('profile:subscription.switchMonthly')
                : t('profile:subscription.switchYearly')}
          </Button>
        ) : (
          <Button fullWidth onPress={() => router.push('/paywall')}>
            {t('paywall:ended.resume')}
          </Button>
        )
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

        {/* Nothing renews for somebody who has not bought anything, and
            quoting a price beside "Free plan" reads as a charge they are
            already committed to. */}
        {entitled ? (
          <Text variant="meta">
            {lifetime
              ? t('profile:subscription.neverRenews')
              : t('profile:subscription.renews', {
                  price:
                    (yearly ? prices?.yearly?.priceString : prices?.monthly?.priceString) ?? '—',
                })}
          </Text>
        ) : (
          <Text variant="meta">{t('profile:subscription.freeBody')}</Text>
        )}
      </Card>

      {/* The whole card is about a plan, so there is nothing honest to put in
          it for somebody on none: "Plan: Monthly, Per month: $4.99" described
          a subscription they had not bought, and "Payment: promotional" leaked
          how the row got there. */}
      {entitled ? (
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
              (lifetime
                ? prices?.lifetime?.priceString
                : yearly
                  ? prices?.yearly?.perMonthString
                  : prices?.monthly?.priceString) ?? '—'
            }
          />
          {/* The store holds the card, and never tells us anything about it.
            What it does tell us is which store the purchase came from. */}
          <Row
            label={t('profile:subscription.payment')}
            value={subscription?.store ?? t('profile:subscription.paymentUnknown')}
          />
        </Card>
      ) : null}

      <Card
        title={entitled ? t('profile:subscription.included') : t('profile:subscription.whatYouGet')}
      >
        <CheckList
          items={[
            t('profile:subscription.perks.unlimited'),
            t('profile:subscription.perks.scanning'),
            t('profile:subscription.perks.database'),
          ]}
        />
      </Card>

      {entitled ? (
        <Button variant="ghost" fullWidth onPress={() => setConfirmCancel(true)}>
          {t('profile:subscription.cancel')}
        </Button>
      ) : null}

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
