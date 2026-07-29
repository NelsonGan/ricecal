import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { type ActivityLevel, useProfile, useUpdateProfile } from '@/data'
import { ChoiceCard, OnboardingStep } from '@/features/onboarding'
import { Text } from '@/ui'

const OPTIONS: ActivityLevel[] = ['sedentary', 'light', 'onFeet', 'veryActive']

/** 04 ACTIVITY */
export default function ActivityStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  // The column is snake_case; the copy keys and this screen are not.
  const activity: ActivityLevel | undefined =
    profile?.activity_level === 'on_feet'
      ? 'onFeet'
      : profile?.activity_level === 'very_active'
        ? 'veryActive'
        : profile?.activity_level

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
          onPress={() => updateProfile.mutate({ activity: option })}
        />
      ))}

      <Text variant="meta" className="px-0.5">
        {t('activity.note')}
      </Text>
    </OnboardingStep>
  )
}
