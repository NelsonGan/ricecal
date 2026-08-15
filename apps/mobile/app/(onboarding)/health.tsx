import { Redirect, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'

import { useConnectHealth, useSession } from '@/data'
import { FactRow, OnboardingStep } from '@/features/onboarding'
import { type Availability, canOfferDemo, offeredProviders, type ProviderId } from '@/lib/health'
import { Button, Card, Text, useToast } from '@/ui'

/**
 * 08 CONNECT HEALTH
 *
 * The first of the two permissions, and it is first for a reason: it is the one
 * that gives the user something rather than asking for something. Movement
 * EXTENDS the budget — `goal + active - eaten` — so the sentence at the top is a
 * promise about more food, not a request for data, and it lands better before
 * the reminder ask than after it.
 *
 * WHY THIS IS NOT `ConnectPanel`
 *
 * The Activity tab's panel is the same subject and a different job. There it is
 * the whole screen and has to carry its own heading, its own CTA and every
 * failure explanation for a user who came looking for the feature. Here it is
 * one step in a numbered flow whose frame already owns the heading and the two
 * buttons, and whose most likely answer is "not now". Rendering the panel inside
 * the step gave two headings and two connect buttons, so the read rows are
 * shared through the copy — `activity:connect.*` — and nothing else is.
 *
 * WHAT HAPPENS WHEN IT FAILS
 *
 * Nothing that stops the flow. A refused permission, an unusable store, a read
 * that comes back empty: all of them say so in a toast and move to the next
 * step, because there is a whole tab devoted to trying again and no version of
 * this screen should be a wall between a new account and their diary.
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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

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
  const canConnect = availability?.ok ?? false

  /**
   * Whether to stop offering the connection at all — KNOWN unusable, not merely
   * not-yet-known.
   *
   * The distinction is the whole reason this is not `!canConnect`. The check is a
   * round trip into HealthKit or the Health Connect SDK, so `availability` is
   * null for the first frame or two, and a label derived from `canConnect` alone
   * read "Continue" on mount and then became "Connect Apple Health" — every user
   * on every launch, a button changing its mind about what it does under the
   * thumb about to press it. The button is disabled until the answer lands
   * either way, so showing the likely label first promises nothing.
   */
  const unusable = availability !== null && !availability.ok

  /**
   * Offline is a wait, not a refusal.
   *
   * Writes are `networkMode: 'online'` across the app, so react-query holds this
   * mutation PAUSED rather than rejecting it — `onError` never fires, the
   * permission sheet never appears, and the screen sat on "Reading your history…"
   * indefinitely. It says so instead, and "Not now" is still live, which is the
   * exit that matters: a permission screen must never be the thing standing
   * between a minute-old account and their diary.
   */
  const waiting = connect.isPaused

  const attempt = (provider: ProviderId) => {
    setProgress(null)
    connect.mutate(
      { provider, onProgress: setProgress },
      {
        onSuccess: (result) => {
          // Zero days after a granted-looking connect is the only signal iOS
          // gives that the read was refused, and an empty simulator store looks
          // identical. Either way the next screen is the next screen.
          if (result.granted && result.days === 0) {
            toast.show({ title: t('onboarding:health.emptyToast'), tone: 'warning' })
          }
          next()
        },
        onError: () => {
          toast.show({ title: t('onboarding:health.failedToast'), tone: 'warning' })
          next()
        },
      },
    )
  }

  return (
    <OnboardingStep
      name="health"
      accent="water"
      title={t('onboarding:health.title')}
      subtitle={t('onboarding:health.subtitle')}
      primaryLabel={
        unusable
          ? t('common:action.continue')
          : isApple
            ? t('onboarding:health.connectApple')
            : t('onboarding:health.connectAndroid')
      }
      // Held until the availability check lands, so a button that cannot do what
      // it says is never pressable — on an iPad it becomes "Continue" instead.
      primaryDisabled={availability === null || connect.isPending}
      onPrimary={canConnect ? () => attempt(nativeId) : next}
      secondaryLabel={unusable ? undefined : t('onboarding:health.later')}
      onSecondary={unusable ? undefined : next}
    >
      <Card title={t('activity:connect.readTitle')}>
        <View className="gap-3.5">
          <FactRow
            icon={{ set: 'body', name: 'flame-burn' }}
            title={t('activity:connect.energy')}
            body={t('activity:connect.energyBody')}
          />
          <FactRow
            icon={{ set: 'body', name: 'footprints' }}
            title={t('activity:connect.steps')}
            body={t('activity:connect.stepsBody')}
          />
          <FactRow
            icon={{ set: 'body', name: 'stopwatch' }}
            title={t('activity:connect.workouts')}
            body={t('activity:connect.workoutsBody')}
          />
        </View>

        {/* The promise, kept beside the permission rather than in a settings
            screen nobody opens. It is literally true: the HealthKit request
            passes an empty `toShare` and the Health Connect one asks only to
            read. */}
        <Text variant="meta" className="pt-4">
          {t('activity:connect.privacy')}
        </Text>
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
            <Button
              variant="secondary"
              fullWidth
              disabled={connect.isPending}
              onPress={() => attempt('demo')}
            >
              {t('onboarding:health.demo')}
            </Button>
            <Text variant="meta" className="text-center">
              {t('activity:connect.demoBody')}
            </Text>
          </View>
        </Card>
      ) : null}

      <Text variant="meta" className="px-0.5 text-center">
        {waiting
          ? t('onboarding:health.offline')
          : connect.isPending && progress
            ? t('activity:connect.progress', progress)
            : connect.isPending
              ? t('activity:connect.connecting')
              : t('onboarding:health.reassurance')}
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
