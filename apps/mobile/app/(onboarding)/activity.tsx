import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ActivityLevel } from '@/data'
import { ChoiceCard, OnboardingStep, useOnboardingDraft } from '@/features/onboarding'
import { Text } from '@/ui'

const OPTIONS: ActivityLevel[] = ['sedentary', 'light', 'onFeet', 'veryActive']

/** 03 ACTIVITY */
export default function ActivityStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  // Held in the client's own spelling. The snake_case the column wants is a
  // detail of the flush, which is the only thing that talks to the database.
  const { draft, patch } = useOnboardingDraft()

  return (
    <OnboardingStep
      name="activity"
      accent="hibiscus"
      title={t('activity.title')}
      subtitle={t('activity.subtitle')}
      primaryLabel={t('common:action.continue')}
      // The activity multiplier is the other half of the budget calculation;
      // `compute_targets()` reads it, so it cannot be skipped.
      primaryDisabled={!draft.activity}
      onPrimary={() => router.push('/food-style')}
    >
      {OPTIONS.map((option) => (
        <ChoiceCard
          key={option}
          accent="hibiscus"
          title={t(`activity.${option}.title`)}
          description={t(`activity.${option}.subtitle`)}
          selected={draft.activity === option}
          onPress={() => patch({ activity: option })}
        />
      ))}

      <Text variant="meta" className="px-0.5">
        {t('activity.note')}
      </Text>
    </OnboardingStep>
  )
}
