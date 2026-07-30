import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useProfile, useUpdateProfile } from '@/data'
import { ChoiceCard, OnboardingStep } from '@/features/onboarding'

const OPTIONS = ['tiktok', 'instagram', 'friend', 'appStore', 'youtube', 'other'] as const

/** 06 WHERE HEARD */
export default function SourceStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const source = profile?.referral_source

  return (
    <OnboardingStep
      step={5}
      total={5}
      accent="water"
      title={t('source.title')}
      subtitle={t('source.subtitle')}
      primaryLabel={t('common:action.continue')}
      primaryDisabled={!source}
      onPrimary={() => router.push('/target')}
    >
      {OPTIONS.map((option) => (
        <ChoiceCard
          key={option}
          accent="water"
          title={t(`source.${option}`)}
          selected={source === option}
          onPress={() => updateProfile.mutate({ referralSource: option })}
        />
      ))}
    </OnboardingStep>
  )
}
