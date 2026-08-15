import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ActivityLevel } from '@/data'
import { ChoiceCard, OnboardingStep, useOnboardingDraft } from '@/features/onboarding'

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
      // `dismissTo` rather than `back()` on every step of this flow — see the
      // note on `about`, which is deep-linked by two redirects and so cannot
      // assume there is anything under it to pop.
      onBack={() => router.dismissTo('/(onboarding)/about')}
      primaryLabel={t('common:action.continue')}
      // The activity multiplier is the other half of the budget calculation;
      // `compute_targets()` reads it, so it cannot be skipped.
      primaryDisabled={!draft.activity}
      onPrimary={() => router.push('/(onboarding)/source')}
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
    </OnboardingStep>
  )
}
