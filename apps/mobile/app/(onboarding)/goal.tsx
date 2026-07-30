import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { Goal } from '@/data'
import { ChoiceCard, OnboardingStep, useOnboardingDraft } from '@/features/onboarding'

const OPTIONS: Goal[] = ['lose', 'maintain', 'gain', 'track']

/** 02 GOAL */
export default function GoalStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  // The draft, not the profile. There is no account until the end of the flow,
  // and the hooks that write a profile throw without a session. It is also
  // instant, so the radio fills in on the same frame as the tap.
  const { draft, patch } = useOnboardingDraft()

  return (
    <OnboardingStep
      step={1}
      total={5}
      accent="kaya"
      title={t('goal.title')}
      subtitle={t('goal.subtitle')}
      primaryLabel={t('common:action.continue')}
      // Nothing to continue to until a goal exists: the budget the whole flow
      // is computing branches on it, and skipping past leaves it unset.
      primaryDisabled={!draft.goal}
      onPrimary={() => router.push('/about')}
    >
      {OPTIONS.map((option) => (
        <ChoiceCard
          key={option}
          accent="kaya"
          title={t(`goal.${option}.title`)}
          description={t(`goal.${option}.subtitle`)}
          selected={draft.goal === option}
          onPress={() => patch({ goal: option })}
        />
      ))}
    </OnboardingStep>
  )
}
