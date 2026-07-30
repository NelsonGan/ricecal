import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { type ActivityLevel, fromDbActivity, useProfile, useUpdateProfile } from '@/data'
import { ChoiceCard, OnboardingStep } from '@/features/onboarding'
import { Text } from '@/ui'

const OPTIONS: ActivityLevel[] = ['sedentary', 'light', 'onFeet', 'veryActive']

/** 04 ACTIVITY */
export default function ActivityStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  // The column is snake_case; the copy keys and this screen are not. Through
  // the shared mapper rather than a ternary per spelling, so a fifth activity
  // level is one entry in `types.ts` instead of a silent fall-through here.
  const activity: ActivityLevel | undefined = profile?.activity_level
    ? fromDbActivity(profile.activity_level)
    : undefined

  return (
    <OnboardingStep
      step={3}
      total={5}
      accent="hibiscus"
      title={t('activity.title')}
      subtitle={t('activity.subtitle')}
      primaryLabel={t('common:action.continue')}
      // The activity multiplier is the other half of the budget calculation;
      // `compute_targets()` reads it, so it cannot be skipped.
      primaryDisabled={!activity}
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
