import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { ChoiceCard, OnboardingStep } from '@/features/onboarding'
import { type ActivityLevel, useAppState, useDispatch } from '@/mock'
import { Text } from '@/ui'

const OPTIONS: ActivityLevel[] = ['sedentary', 'light', 'onFeet', 'veryActive']

/** 04 ACTIVITY */
export default function ActivityStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const dispatch = useDispatch()
  const activity = useAppState((state) => state.profile.activity)

  return (
    <OnboardingStep
      step={3}
      total={5}
      accent="hibiscus"
      title={t('activity.title')}
      subtitle={t('activity.subtitle')}
      primaryLabel={t('common:action.continue')}
      onPrimary={() => router.push('/food-style')}
    >
      {OPTIONS.map((option) => (
        <ChoiceCard
          key={option}
          accent="hibiscus"
          title={t(`activity.${option}.title`)}
          description={t(`activity.${option}.subtitle`)}
          selected={activity === option}
          onPress={() => dispatch({ type: 'updateProfile', patch: { activity: option } })}
        />
      ))}

      <Text variant="meta" className="px-0.5">
        {t('activity.note')}
      </Text>
    </OnboardingStep>
  )
}
