import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { OnboardingStep, useOnboardingDraft } from '@/features/onboarding'
import { Chip } from '@/ui'

const TAGS = [
  'halal',
  'mamak',
  'kopitiam',
  'hawker',
  'homeCooked',
  'vegetarian',
  'noBeef',
  'lessSugar',
  'nasiCampur',
] as const

/**
 * 04 FOOD STYLE
 *
 * No meal times here any more. They are seeded alongside the account by the
 * signup trigger, and the account does not exist until the end of the flow — so
 * this screen used to render a titled card with nothing in it, and the query
 * behind it threw for want of a session. The reminders screen is where they are
 * set, and it is reachable the moment there is an account to set them on.
 */
export default function FoodStyleStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const { draft, patch } = useOnboardingDraft()
  const foodStyles = draft.foodStyles ?? []

  /**
   * Reads the current list and writes the new one.
   *
   * Sound here only because the draft is synchronous: computing "the list plus
   * one" against a value that a round trip has not returned yet is how a fast
   * second tap silently drops the first.
   */
  const toggle = (tag: string) => {
    patch({
      foodStyles: foodStyles.includes(tag)
        ? foodStyles.filter((existing) => existing !== tag)
        : [...foodStyles, tag],
    })
  }

  return (
    <OnboardingStep
      name="foodStyle"
      accent="kaya"
      title={t('foodStyle.title')}
      subtitle={t('foodStyle.subtitle')}
      primaryLabel={t('common:action.continue')}
      // Multi-select, so the gate is "at least one" rather than "exactly one".
      primaryDisabled={foodStyles.length === 0}
      onPrimary={() => router.push('/source')}
    >
      {/* Multi-select, so these are checkboxes wearing chips rather than
          radios — the role says so even though the shape does not. */}
      <View className="flex-row flex-wrap gap-2.5">
        {TAGS.map((tag) => (
          <Chip
            key={tag}
            tone="kaya"
            selected={foodStyles.includes(tag)}
            onPress={() => toggle(tag)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: foodStyles.includes(tag) }}
          >
            {t(`foodStyle.tags.${tag}`)}
          </Chip>
        ))}
      </View>
    </OnboardingStep>
  )
}
