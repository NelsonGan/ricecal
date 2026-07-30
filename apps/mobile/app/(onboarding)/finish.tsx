import { Redirect, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useFinishOnboarding, useSession } from '@/data'
import { type CompleteDraft, isComplete, useOnboardingDraft } from '@/features/onboarding'
import { birthDateFromAge } from '@/lib/nutrition'
import { Button, EmptyState, Screen, Spinner, Text } from '@/ui'

/**
 * 08 SAVING
 *
 * The one write the flow makes.
 *
 * Seven screens of answers were kept on the phone because there was no account to
 * put them in; this is where they land, and the only screen in the flow that needs
 * a session. It is reached two ways — straight from the target screen when the
 * user already had one, or from the index route the moment signing in creates one
 * — and both come here rather than writing at the call site, so one place knows
 * what "finished" means.
 *
 * Deliberately a screen rather than an effect somewhere invisible: this is a
 * network write that can fail, and a failure needs somewhere to say so and a
 * button to try again. Losing seven screens of answers to a dropped connection
 * would be the worst moment in the app to be silent.
 *
 * Split in two because the guards have to run before the hooks. `useFinishOnboarding`
 * calls `useUserId`, which throws without a session, and a route is deep-linkable
 * whether or not the flow ever points at it — so the session and the draft are
 * checked out here, where no hook has been called yet.
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
   */
  if (!isComplete(draft)) return <Redirect href="/goal" />

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
        goal: draft.goal,
        sex: draft.sex,
        // Stored as a birth date: an integer age is wrong within a year of being
        // written and nothing would ever correct it.
        birthDate: birthDateFromAge(draft.age),
        heightCm: draft.heightCm,
        weightKg: draft.weightKg,
        targetWeightKg: draft.targetWeightKg,
        activity: draft.activity,
        foodStyles: draft.foodStyles,
        referralSource: draft.referralSource,
      },
      {
        onSuccess: () => {
          const exit = draft.exit === 'preview' ? '/preview' : '/today'
          // Cleared only now. Until the write lands, the draft is the only copy of
          // these answers anywhere.
          clear()
          router.replace(exit)
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
