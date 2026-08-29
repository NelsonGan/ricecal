import { Redirect, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'

import { useConnectHealth, useSession } from '@/data'
import { FactRow, OnboardingStep } from '@/features/onboarding'
import {
  type AccessResult,
  type Availability,
  canOfferDemo,
  offeredProviders,
  type ProviderId,
  providerFor,
} from '@/lib/health'
import { Button, Card, Text, useToast } from '@/ui'

/**
 * Connect health: the first of the two permissions, and first because it gives
 * the user something rather than asking for something. Movement extends the
 * budget, so the sentence at the top is a promise about more food.
 *
 * Not `ConnectPanel`, which is the same subject and a different job: there it is
 * the whole screen and carries its own heading, CTA and failure explanations,
 * where here the flow's frame already owns those. Rendering the panel inside the
 * step gave two headings and two connect buttons, so only the read rows are
 * shared, through `activity:connect.*`.
 *
 * One button, and it says "Continue". Both halves are guideline 5.1.1(iv), which
 * this app was rejected under: a custom message before a permission request has
 * to lead to the request, so the "Not now" is gone, and the button may not be
 * dressed as the ask. Saying no is the sheet's own "Don't Allow".
 *
 * Nothing here stops the flow. An unusable store, a sheet that could not be
 * presented and an empty read each say so in a toast and move on, because there
 * is a whole tab devoted to trying again. A refusal says nothing at all, being an
 * answer rather than a failure.
 */

/** The session guard, for the same two reasons as `settings/health.tsx`. */
export default function HealthStepRoute() {
  const { session, loading } = useSession()

  if (loading) return null
  // Every hook below reaches `useUserId`, which throws by design without one.
  if (!session) return <Redirect href="/" />

  return <HealthStep />
}

function HealthStep() {
  const { t } = useTranslation(['onboarding', 'activity', 'common'])
  const router = useRouter()
  const toast = useToast()

  const connect = useConnectHealth()

  /**
   * What this device will allow, asked once on mount.
   *
   * State rather than a query: it is a question about the phone, not about the
   * account, so it has no cache key that would mean anything and nothing
   * invalidates it but a trip to Settings. `null` until the answer arrives, so
   * the button does not appear as "connect" and then change its mind.
   */
  const [availability, setAvailability] = useState<Availability | null>(null)
  const check = useCallback(() => {
    offeredProviders().then(({ native }) => setAvailability(native.availability))
  }, [])
  useEffect(check, [check])

  const next = () => router.replace('/(onboarding)/notifications')

  const isApple = Platform.OS === 'ios'
  const nativeId: ProviderId = isApple ? 'apple_health' : 'health_connect'
  // Only where the native store is unusable, and only in development. On a real
  // phone with a real Health app this is a trap, not an option.
  const offerDemo = availability ? canOfferDemo(availability, false) : false
  /**
   * Whether the button will put a sheet up or merely move on.
   *
   * It is deliberately NOT read for the label, and there used to be a second
   * flag here that was. The check is a round trip into HealthKit or the Health
   * Connect SDK, so `availability` is null for the first frame or two, and a
   * label derived from it read "Continue" on mount and then became "Connect
   * Apple Health" — a button changing its mind about what it does under the
   * thumb about to press it. One label for both branches ends that, and it is
   * the label App Review asked for anyway.
   */
  const canConnect = availability?.ok ?? false

  /**
   * The sheet first, on its own, and the step is over the moment it is answered.
   * Two things force that shape.
   *
   * Guideline 5.1.1(iv) means there is no "Not now" here, so the button must be
   * able to put the sheet up. That rules out asking through the mutation, since
   * every write is `networkMode: 'online'` and react-query holds a paused one
   * without running its body: offline, the old shape drew a spinner and no sheet.
   * `requestAccess` is local and answers offline like any other day.
   *
   * The backfill is a week of reads and nothing on its far side belongs to this
   * screen, so it is fired and left to run while `next()` moves on.
   *
   * Which is why the toasts hang off `mutateAsync` rather than `mutate`'s
   * callbacks: those are dropped when the component unmounts, and this one
   * unmounts a tick after the mutation starts. `ToastProvider` sits above the
   * navigator, so the message lands wherever the user has got to.
   */
  const attempt = async (provider: ProviderId) => {
    /**
     * A THROW HERE MUST NOT END THE STEP, and this catch is the only thing
     * standing between a rejected promise and a screen nobody can leave.
     *
     * `requestAccess` is a native call. `requestAuthorization` raises when
     * HealthKit refuses to present the sheet at all, and Health Connect's
     * `requestPermission` raises when the activity cannot be started. There is
     * no "Not now" here any more, so an unhandled rejection would leave the
     * user on a permission screen with one button that does nothing — which is
     * the failure this whole shape exists to prevent.
     */
    let access: AccessResult
    try {
      access = await providerFor(provider).requestAccess()
    } catch {
      toast.show({ title: t('onboarding:health.failedToast'), tone: 'warning' })
      next()
      return
    }

    /**
     * A no is not a failure, and it is silent. Android reports a real answer, so
     * `granted: false` is somebody having read Health Connect's dialog and
     * declined, and a toast about it would be the app arguing. iOS never says no;
     * see `requestAccess` in `lib/health/apple.ts`.
     *
     * The sync is not fired either: there is no permission to read with, and a
     * connection row would tell the Activity tab it was connected.
     */
    if (!access.granted) {
      next()
      return
    }

    connect
      // No `onProgress`. Nothing on this screen reports the backfill any more,
      // and a callback whose only effect is a setState nobody renders is a
      // re-render per day read.
      .mutateAsync({ provider, access })
      .then((result) => {
        // Zero days after a granted-looking connect is the only signal iOS
        // gives that the read was refused, and an empty simulator store looks
        // identical.
        if (result.granted && result.days === 0) {
          toast.show({ title: t('onboarding:health.emptyToast'), tone: 'warning' })
        }
      })
      .catch(() => {
        toast.show({ title: t('onboarding:health.failedToast'), tone: 'warning' })
      })

    next()
  }

  return (
    <OnboardingStep
      name="health"
      accent="water"
      title={t('onboarding:health.title')}
      subtitle={t('onboarding:health.subtitle')}
      /* "Continue", on both branches, and it used to name the store.
         App Review reads "Connect Apple Health" on the button in front of a
         permission sheet as the app doing the asking rather than the system —
         guideline 5.1.1(iv), and it is what this app was rejected for. The
         store is still named, twice: in the sentence above the button and in
         the rows below it. Only the button changed.

         It also has one label now instead of two. The old pair differed only
         in which store they named, and the branch that picked between them is
         the branch that made the button change its mind on mount. */
      primaryLabel={t('common:action.continue')}
      // Held until the availability check lands, so a button that cannot do what
      // it says is never pressable.
      primaryDisabled={availability === null}
      onPrimary={canConnect ? () => attempt(nativeId) : next}
      /* NO SECOND BUTTON, and its absence is the other half of the rejection.
         "Not now" let somebody dismiss the explanation without ever reaching
         the permission request, which the guideline forbids: the message has to
         lead to the sheet. Saying no is still a one-tap answer — it is the
         sheet's own "Don't Allow", which is the system's word rather than
         ours, and the step ends either way. */
      secondaryLabel={undefined}
      onSecondary={undefined}
    >
      {/* Three words each, and no bodies under them.
          The rows used to carry a second line apiece ("what you burned moving",
          "daily habit, not a target") on a screen whose whole job is to get a
          permission sheet in front of somebody. What is being read is a list,
          and a list wants to be scanned. The bodies still exist for the
          Activity tab's panel, which is a screen somebody CAME to read. */}
      <Card title={t('activity:connect.readTitle')}>
        <View className="gap-3.5">
          <FactRow
            icon={{ set: 'body', name: 'flame-burn' }}
            title={t('activity:connect.energy')}
          />
          <FactRow icon={{ set: 'body', name: 'footprints' }} title={t('activity:connect.steps')} />
          <FactRow
            icon={{ set: 'body', name: 'stopwatch' }}
            title={t('activity:connect.workouts')}
          />
        </View>
      </Card>

      {/* Only when the store cannot be used. The reason is a real sentence with
          a real remedy — "install Health Connect", "this device has no Health
          store" — because "unavailable" leaves the reader with nothing to do. */}
      {availability && !availability.ok ? (
        <Card tone="kaya">
          <Text variant="body" className="text-kaya-ink">
            {t(REASON_KEY[availability.reason])}
          </Text>
        </Card>
      ) : null}

      {offerDemo ? (
        <Card>
          <View className="gap-2">
            <Button variant="secondary" fullWidth onPress={() => attempt('demo')}>
              {t('onboarding:health.demo')}
            </Button>
            <Text variant="meta" className="text-center">
              {t('activity:connect.demoBody')}
            </Text>
          </View>
        </Card>
      ) : null}

      {/* NOTHING ABOUT THE READ ITSELF, and there is now nothing it could say.
          This line used to become "Reading your history…" and then "3 of 7"
          while the backfill ran, which turned a permission screen into a
          progress screen: the user has already answered by then, and there is
          nothing on the far side of it but the next step. The step no longer
          waits for the read at all — see `attempt` — so the offline sentence
          that used to sit here has gone with the wait it described. */}
      <Text variant="meta" className="px-0.5 text-center">
        {t('onboarding:health.reassurance')}
      </Text>
    </OnboardingStep>
  )
}

/** Copy keys as a map, so a renamed key is a compile error rather than a blank. */
const REASON_KEY = {
  'wrong-platform': 'activity:connect.wrongPlatform',
  'no-health-store': 'activity:connect.simulator',
  'not-installed': 'activity:connect.notInstalled',
  'not-linked': 'activity:connect.notLinked',
} as const satisfies Record<Extract<Availability, { ok: false }>['reason'], string>
