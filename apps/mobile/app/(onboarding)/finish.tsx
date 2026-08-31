import { Redirect, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useFinishOnboarding, useSession } from '@/data'
import { type CompleteDraft, isComplete, useOnboardingDraft } from '@/features/onboarding'
import { planDirection, setPersonProps, track } from '@/lib/analytics'
import { birthDateFromAge } from '@/lib/nutrition'
import { Button, EmptyState, Screen, Spinner, Text } from '@/ui'

/**
 * Saving: the hinge between the questions and the permissions, and the one write
 * the flow makes.
 *
 * Four screens of answers were kept on the phone because there was no account to
 * put them in. Two routes reach this screen, and both come here rather than
 * writing at the call site, so one place knows what "finished" means.
 *
 * No progress bar of its own: there is no decision on it and it is gone in a
 * second on any working connection.
 *
 * A screen rather than an invisible effect, because this is a network write that
 * can fail and a failure needs somewhere to say so and a button to try again.
 *
 * Split in two because the guards run before the hooks: `useFinishOnboarding`
 * calls `useUserId`, which throws without a session, and a route is deep-linkable
 * whether or not the flow points at it.
 */
export default function FinishStep() {
  const { session, loading } = useSession()
  const { draft } = useOnboardingDraft()

  if (loading) return <Saving />

  // Back to the index route to be placed properly rather than guessing from here.
  if (!session) return <Redirect href="/" />

  /**
   * An incomplete draft means these answers were never given on this phone — a
   * fresh install signing in, most often, where the questions were answered
   * elsewhere and already flushed there. Back to the start rather than writing
   * half a profile.
   *
   * The START, which is `setup`. It said `/about` while `units` was collected
   * one screen earlier, so a draft missing only that answer was sent somewhere
   * that could not supply it and arrived back here to be turned away again.
   */
  if (!isComplete(draft)) return <Redirect href="/setup" />

  return <Flush draft={draft} />
}

function Flush({ draft }: { draft: CompleteDraft }) {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const { clear } = useOnboardingDraft()
  const finishOnboarding = useFinishOnboarding()

  // Once, on arrival. `mutate` is stable but the draft object is not, and a
  // dependency on it would re-run this the moment the flush cleared it.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    finishOnboarding.mutate(
      {
        // Not a fact about the body, so it lands in `user_settings` rather
        // than `profiles`. Every screen converts kilograms on the way out.
        units: draft.units,
        sex: draft.sex,
        // Stored as a birth date: an integer age is wrong within a year of being
        // written and nothing would ever correct it.
        birthDate: birthDateFromAge(draft.age),
        heightCm: draft.heightCm,
        weightKg: draft.weightKg,
        targetWeightKg: draft.targetWeightKg,
        activity: draft.activity,
        referralSource: draft.referralSource,
      },
      {
        onSuccess: (profile) => {
          /**
           * The one moment a stranger becomes an account, and the only place
           * every answer is in hand at once — the draft is about to be cleared
           * and nothing downstream sees it again.
           *
           * The two weights go no further than `planDirection`. What a segment
           * is ever built on is which way the plan runs, and sending the
           * direction rather than the kilos means no body figure leaves the
           * phone. Same reasoning as the rest of `PersonProps`.
           */
          const direction = planDirection(draft.weightKg, draft.targetWeightKg)
          setPersonProps({
            onboarded: true,
            onboarded_at: profile.onboarded_at ?? new Date().toISOString(),
            plan_direction: direction,
            activity_level: draft.activity,
            referral_source: draft.referralSource,
          })
          /**
           * The referral source rides on the EVENT as well as on the person.
           *
           * As a person property alone it answers "who is here from TikTok"
           * and nothing about when: it is set at the one moment onboarding
           * finishes, so a funnel broken down by acquisition channel could
           * only ever be built by joining back to the profile. On the
           * completion event it is a breakdown in one click, which is the
           * whole reason the question is asked.
           */
          track('Onboarding Completed', {
            plan_direction: direction,
            referral_source: draft.referralSource,
          })

          // Cleared only now. Until the write lands, the draft is the only copy of
          // these answers anywhere.
          clear()
          /**
           * On to the permissions, not to the diary.
           *
           * This is the first moment there IS an account, and both of the
           * remaining asks need one — a health connection is a row keyed by
           * user, and turning a meal reminder on is a write to `meal_times`.
           * They could not have been asked earlier, which is why the flow
           * crosses the account step to reach them.
           *
           * `replace`, so the saving screen is not something an edge swipe can
           * return to. It would start the write again.
           */
          router.replace('/(onboarding)/health')
        },
      },
    )
  }, [draft, finishOnboarding, clear, router])

  /**
   * Offline is not an error here, it is a wait.
   *
   * Writes are `networkMode: 'online'` across the app, so react-query holds this
   * one paused rather than rejecting it, and it will run itself the moment a
   * connection returns. Saying so beats a spinner that looks stuck — and beats a
   * retry button for something that needs no retrying.
   */
  if (finishOnboarding.isPaused) {
    return (
      <Screen scroll={false} contentClassName="items-center justify-center">
        <EmptyState
          title={t('onboarding:saving.offlineTitle')}
          description={t('onboarding:saving.offlineBody')}
          icon={{ set: 'system', name: 'cloud' }}
        />
      </Screen>
    )
  }

  if (finishOnboarding.isError) {
    const error = finishOnboarding.error
    return (
      <Screen
        footer={
          <Button
            fullWidth
            onPress={() => {
              started.current = false
              finishOnboarding.reset()
            }}
          >
            {t('common:action.retry')}
          </Button>
        }
      >
        <EmptyState
          title={t('onboarding:saving.failedTitle')}
          description={error instanceof Error ? error.message : t('onboarding:saving.failedBody')}
          icon={{ set: 'system', name: 'sync' }}
        />
      </Screen>
    )
  }

  return <Saving />
}

function Saving() {
  const { t } = useTranslation('onboarding')

  return (
    <Screen scroll={false} contentClassName="items-center justify-center">
      <View className="items-center gap-4">
        <Spinner />
        <Text variant="meta">{t('saving.title')}</Text>
      </View>
    </Screen>
  )
}
