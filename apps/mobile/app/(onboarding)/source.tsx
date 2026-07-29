import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { ChoiceCard, OnboardingStep } from '@/features/onboarding'
import { useAppState, useDispatch } from '@/mock'

const OPTIONS = ['tiktok', 'instagram', 'friend', 'appStore', 'youtube', 'other'] as const

/** 06 WHERE HEARD */
export default function SourceStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const dispatch = useDispatch()
  const source = useAppState((state) => state.profile.source)

  return (
    <OnboardingStep
      step={5}
      total={5}
      accent="water"
      title={t('source.title')}
      subtitle={t('source.subtitle')}
      primaryLabel={t('common:action.continue')}
      onPrimary={() => router.push('/target')}
    >
      {OPTIONS.map((option) => (
        <ChoiceCard
          key={option}
          accent="water"
          title={t(`source.${option}`)}
          selected={source === option}
          onPress={() => dispatch({ type: 'updateProfile', patch: { source: option } })}
        />
      ))}
    </OnboardingStep>
  )
}
