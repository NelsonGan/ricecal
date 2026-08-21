import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ActivityLevel } from '@/data'
import { ChoiceCard, OnboardingStep, useOnboardingDraft } from '@/features/onboarding'
import type { IconProps } from '@/ui'

/**
 * The four answers, each with the drawing that stands for it.
 *
 * A picture per option rather than a picture for the screen. The question is
 * "which of these is your day", and four days are easier to tell apart side by
 * side than to read: the desk is the one nobody has to finish the sentence for.
 */
const OPTIONS = [
  { id: 'sedentary', icon: { set: 'scenes', name: 'desk' } },
  { id: 'light', icon: { set: 'scenes', name: 'sneakers' } },
  { id: 'onFeet', icon: { set: 'scenes', name: 'apron' } },
  { id: 'veryActive', icon: { set: 'scenes', name: 'dumbbell' } },
] as const satisfies ReadonlyArray<{ id: ActivityLevel; icon: IconProps }>

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
          key={option.id}
          accent="hibiscus"
          icon={option.icon}
          title={t(`activity.${option.id}.title`)}
          description={t(`activity.${option.id}.subtitle`)}
          selected={draft.activity === option.id}
          onPress={() => patch({ activity: option.id })}
        />
      ))}
    </OnboardingStep>
  )
}
