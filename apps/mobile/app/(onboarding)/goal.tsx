import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { ChoiceCard, OnboardingStep } from '@/features/onboarding'
import { type Goal, useAppState, useDispatch } from '@/mock'

const OPTIONS: Goal[] = ['lose', 'maintain', 'gain', 'track']

/** 02 GOAL */
export default function GoalStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const dispatch = useDispatch()
  const goal = useAppState((state) => state.profile.goal)

  return (
    <OnboardingStep
      step={1}
      total={5}
      accent="kaya"
      title={t('goal.title')}
      subtitle={t('goal.subtitle')}
      primaryLabel={t('common:action.continue')}
      onPrimary={() => router.push('/about')}
    >
      {OPTIONS.map((option) => (
        <ChoiceCard
          key={option}
          accent="kaya"
          title={t(`goal.${option}.title`)}
          description={t(`goal.${option}.subtitle`)}
          selected={goal === option}
          // Recomputing here means the target on step 07 already reflects the
          // choice, without that screen knowing how the number is made.
          onPress={() => dispatch({ type: 'updateProfile', patch: { goal: option } })}
        />
      ))}
    </OnboardingStep>
  )
}
