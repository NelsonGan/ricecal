import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  ChoiceCard,
  OnboardingStep,
  stepNumber,
  TOTAL_STEPS,
  useOnboardingDraft,
} from '@/features/onboarding'

const OPTIONS = ['tiktok', 'instagram', 'friend', 'appStore', 'youtube', 'other'] as const

/** 04 WHERE HEARD — the last question before the plan is worked out. */
export default function SourceStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const { draft, patch } = useOnboardingDraft()

  return (
    <OnboardingStep
      step={stepNumber('source')}
      total={TOTAL_STEPS}
      accent="water"
      title={t('source.title')}
      subtitle={t('source.subtitle')}
      primaryLabel={t('common:action.continue')}
      primaryDisabled={!draft.referralSource}
      // Group-qualified for the same reason `about` qualifies its push: route
      // groups add no path segment, so a bare name is ambiguous the moment two
      // files anywhere in the app share it.
      onPrimary={() => router.push('/(onboarding)/calculating')}
    >
      {OPTIONS.map((option) => (
        <ChoiceCard
          key={option}
          accent="water"
          title={t(`source.${option}`)}
          selected={draft.referralSource === option}
          onPress={() => patch({ referralSource: option })}
        />
      ))}
    </OnboardingStep>
  )
}
