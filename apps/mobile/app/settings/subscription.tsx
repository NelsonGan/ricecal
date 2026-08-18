import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useEntitlement, usePlanPrices, useSubscription } from '@/data'
import { openManageSubscriptions } from '@/data/purchases'
import { PRO_FEATURES } from '@/features/paywall'
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
  // A one-off purchase has no renewal and nothing to switch to, so both the
  // footer button and the line under the plan have to say something else.
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
            {/* Gated on `entitled`, not on the status alone. A row whose period
                has run out still SAYS `active`, and every gate in the app reads
                the date — so left on the status this line would tell somebody
                they had Pro on the screen offering to sell it to them. */}
            <Text variant="meta">
              {!entitled
                ? t('profile:home.proNone')
                : subscription?.status === 'trial'
                  ? t('profile:subscription.trialLeft', { count: trialDaysLeft })
                  : t('profile:home.proActive')}
            </Text>
          </View>
        </View>

        {/* Only during a trial. Drawn unconditionally it read as a full bar for
            everybody else, because `trialDaysLeft` is 0 when there is no trial
            to be left of — which told a paying subscriber their trial was
            spent, and told somebody who had bought LIFETIME the same thing
            about a trial they never had. */}
        {entitled && subscription?.status === 'trial' ? (
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

      {/* THE WHOLE OF PRO, from the same list the paywall sells it with. It was
          three lines written here — unlimited logging, photo scanning, the food
          database — while the pitch had grown to ten, so the screen you read
          after paying described a smaller product than the one you bought. See
          `PRO_FEATURES`. Titles only: the pitch has room for a sentence under
          each and a settings card does not. */}
      <Card
        title={entitled ? t('profile:subscription.included') : t('profile:subscription.whatYouGet')}
      >
        <CheckList
          items={PRO_FEATURES.map((feature) => t(`paywall:hard.features.${feature.key}.title`))}
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
