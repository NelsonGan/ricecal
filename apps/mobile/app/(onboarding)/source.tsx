import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChoiceCard, OnboardingStep, useOnboardingDraft } from '@/features/onboarding'

const OPTIONS = ['tiktok', 'instagram', 'friend', 'appStore', 'youtube', 'other'] as const

/** 05 WHERE HEARD */
export default function SourceStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const { draft, patch } = useOnboardingDraft()

  return (
    <OnboardingStep
      step={4}
      total={4}
      accent="water"
      title={t('source.title')}
      subtitle={t('source.subtitle')}
      primaryLabel={t('common:action.continue')}
      primaryDisabled={!draft.referralSource}
      onPrimary={() => router.push('/target')}
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
