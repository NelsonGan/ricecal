import { FREE_DAILY_SCANS, FREE_RECIPES } from '@ricecal/shared'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useEntitlement, usePlanPrices } from '@/data'
import { openManageSubscriptions } from '@/data/purchases'
import { PLAN_FEATURES, usePlanSummary } from '@/features/paywall'
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
  const { data: prices } = usePlanPrices()
  const [confirmCancel, setConfirmCancel] = useState(false)

  // `usePlanSummary`, not the column. It reads the store's answer as well as
  // our own mirror of it, so this screen says the right thing in the seconds
  // after a purchase — and it never guesses a plan it cannot name, which is
  // what put "Renews at $4.90" under a promotional grant.
  const plan = usePlanSummary()
  const yearly = plan.plan === 'yearly'
  // A one-off purchase has no renewal and nothing to switch to, so both the
  // footer button and the line under the plan have to say something else. So
  // does an entitlement whose plan is unnamed: there is nothing to switch a
  // promotional grant TO, and offering "Switch to yearly" against one is the
  // app inviting somebody to buy what they have already been given.
  const lifetime = plan.plan === 'lifetime'
  const switchable = plan.plan === 'yearly' || plan.plan === 'monthly'

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
  const trialDaysLeft = plan.trialEndsAt
    ? Math.max(
        0,
        Math.ceil((new Date(plan.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
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
            {!switchable
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
              {plan.state === 'none'
                ? t('profile:home.proNone')
                : plan.state === 'trial'
                  ? t('profile:subscription.trialLeft', { count: trialDaysLeft })
                  : plan.plan
                    ? t('profile:home.proActive', { plan: t(`paywall:plans.${plan.plan}`) })
                    : t('profile:home.proActivePlain')}
            </Text>
          </View>
        </View>

        {/* Only during a trial. Drawn unconditionally it read as a full bar for
            everybody else, because `trialDaysLeft` is 0 when there is no trial
            to be left of — which told a paying subscriber their trial was
            spent, and told somebody who had bought LIFETIME the same thing
            about a trial they never had. */}
        {plan.state === 'trial' ? (
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
          /* NOTHING AT ALL when we cannot name the plan, which is the honest
             answer for a promotional grant. Written as "everything that is not
             lifetime renews", this quoted the MONTHLY price to every account
             holding one — a figure they have never been charged, presented as a
             standing commitment. */
          lifetime || switchable ? (
            <Text variant="meta">
              {lifetime
                ? t('profile:subscription.neverRenews')
                : t('profile:subscription.renews', {
                    price:
                      (yearly ? prices?.yearly?.priceString : prices?.monthly?.priceString) ?? '—',
                  })}
            </Text>
          ) : null
        ) : (
          <Text variant="meta">
            {t('profile:subscription.freeBody', {
              scans: FREE_DAILY_SCANS,
              recipes: FREE_RECIPES,
            })}
          </Text>
        )}
      </Card>

      {/* THE WHOLE OF PRO, from the same list the paywall sells it with. It was
          three lines written here — unlimited logging, photo scanning, the food
          database — while the pitch had grown to ten, so the screen you read
          after paying described a smaller product than the one you bought. See
          `PLAN_FEATURES`. Labels only: the paywall renders each row's two
          values beside it and a settings card has no column to put them in,
          which is fine here — everything on this list is included, and what the
          free tier gets instead is a question for the page that is selling. */}
      <Card
        title={entitled ? t('profile:subscription.included') : t('profile:subscription.whatYouGet')}
      >
        <CheckList
          items={PLAN_FEATURES.map((feature) => t(`paywall:table.rows.${feature.key}.label`))}
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
