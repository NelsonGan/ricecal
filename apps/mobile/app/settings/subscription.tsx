import { FREE_DAILY_SCANS, FREE_RECIPES } from '@ricecal/shared'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useEntitlement, usePlanPrices } from '@/data'
import { openManageSubscriptions } from '@/data/purchases'
import { PLAN_FEATURES, usePlanSummary } from '@/features/paywall'
import { trialProgress } from '@/features/paywall/trial'
import { CheckList } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { AppBar, Button, Card, ConfirmSheet, Icon, ProgressBar, Screen, Text } from '@/ui'

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
  /**
   * A plan that renews, which is the only kind there is anything to do about.
   *
   * `recurring` rather than `switchable`, which is what this was called when
   * switching was the only thing it gated. It now also decides whether there is
   * a subscription to cancel, and a one-off purchase has neither: lifetime has
   * no renewal and nothing to switch to, and an entitlement whose plan is
   * unnamed is a promotional grant, where "Switch to yearly" would be the app
   * inviting somebody to buy what they have already been given.
   */
  const lifetime = plan.plan === 'lifetime'
  const recurring = plan.plan === 'yearly' || plan.plan === 'monthly'

  /**
   * NOT DURING A TRIAL. A plan change out of a free trial ends the trial and
   * bills the new plan at once, so a switch offered to a trial is not plan
   * admin, it is a charge — and it was the loudest control on this screen, one
   * tap from the same store page as Cancel. Two App Store accounts took it and
   * cancelled within two minutes of being charged. Nothing is gained by
   * switching mid-trial, so the offer waits until the trial has converted.
   */
  const trial = plan.state === 'trial'
  const canSwitch = recurring && !trial

  /**
   * Somebody who has never paid, or whose subscription has lapsed.
   *
   * `useEntitlement`, not a second copy of the rule. It exists so that "what
   * does Pro include" is answered once; comparing statuses here would be the
   * screen that silently disagrees when that answer changes.
   */
  const { entitled } = useEntitlement()

  // Whole days left, from the instant the store reported. Not a stored counter:
  // one would need something to decrement it every midnight.
  const trialDaysLeft = plan.trialEndsAt
    ? Math.max(
        0,
        Math.ceil((new Date(plan.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
      )
    : 0
  const progress = trialProgress(plan.trialStartedAt, plan.trialEndsAt)

  // Both of these leave the app. The payment relationship is with the store,
  // and Apple and Google both require cancellation to happen there: the app
  // could not do it even if it wanted to. They open the same page, so the
  // intent is the only thing that tells the two apart afterwards.
  const switchPlan = () => openManageSubscriptions('switch', 'subscription')

  const cancel = () => {
    setConfirmCancel(false)
    openManageSubscriptions('cancel', 'subscription')
  }

  return (
    <Screen
      header={
        <AppBar
          title={t('profile:subscription.title')}
          onBack={() => goBack()}
          backLabel={t('common:a11y.back')}
        />
      }
      footer={
        /* CANCELLING IS THE FOOTER, and switching is not. The two do the same
           thing to the app and very different things to the user, and the one
           that can charge somebody was the one drawn as the main action. A
           lifetime purchase and a promotional grant have nothing to cancel, so
           they keep the plain way through to the store. */
        entitled ? (
          recurring ? (
            <Button variant="neutral" fullWidth onPress={() => setConfirmCancel(true)}>
              {t('profile:subscription.cancel')}
            </Button>
          ) : (
            <Button
              variant="neutral"
              fullWidth
              onPress={() => openManageSubscriptions('manage', 'subscription')}
            >
              {t('profile:subscription.manage')}
            </Button>
          )
        ) : (
          <Button fullWidth onPress={() => router.push('/paywall')}>
            {t('paywall:ended.resume')}
          </Button>
        )
      }
    >
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
                : trial
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
        {trial && progress != null ? (
          <ProgressBar
            value={progress}
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
          lifetime || recurring ? (
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

      {canSwitch ? (
        <Button variant="ghost" fullWidth onPress={switchPlan}>
          {yearly
            ? t('profile:subscription.switchMonthly')
            : t('profile:subscription.switchYearly')}
        </Button>
      ) : null}

      <ConfirmSheet
        visible={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={cancel}
        title={t('profile:subscription.cancelTitle')}
        description={t('profile:subscription.cancelBody')}
        confirmLabel={t('profile:subscription.cancelConfirm')}
        cancelLabel={t('common:action.keep')}
        tone="danger"
      />
    </Screen>
  )
}
