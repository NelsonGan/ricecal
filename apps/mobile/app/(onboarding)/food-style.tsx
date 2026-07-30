import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useMealTimes, useProfile, useUpdateProfile } from '@/data'
import { OnboardingStep } from '@/features/onboarding'
import { Card, Chip, Text } from '@/ui'

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

/** 05 FOOD STYLE */
export default function FoodStyleStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const foodStyles = profile?.food_styles ?? []
  // Seeded with the account by the signup trigger, so there is always a set to
  // show — the reminders screen is where they are changed.
  const { data: mealTimes = [] } = useMealTimes()

  // Snack is left out: it is the slot with no usual time, which is the whole
  // reason it exists.
  const usualTimes = mealTimes
    .filter((slot) => slot.meal !== 'snack')
    .map((slot) => formatTime(slot.at))
    .join(', ')

  const toggle = (tag: string) => {
    const next = foodStyles.includes(tag)
      ? foodStyles.filter((existing) => existing !== tag)
      : [...foodStyles, tag]
    updateProfile.mutate({ foodStyles: next })
  }

  return (
    <OnboardingStep
      step={4}
      total={5}
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

      {/* Only once there are times to show. The query is seeded with the account
          but still has to arrive, and a titled card with an empty line in it
          reads as something that failed rather than something still loading. */}
      {usualTimes ? (
        <Card title={t('foodStyle.mealTimes')}>
          <Text variant="bodyStrong" className="text-[16px]">
            {usualTimes}
          </Text>
        </Card>
      ) : null}
    </OnboardingStep>
  )
}

/** "08:00:00" → "8:00 am". Postgres `time` carries seconds nobody wants to read. */
function formatTime(at: string): string {
  const [rawHour = '0', minute = '00'] = at.split(':')
  const hour = Number(rawHour)
  const suffix = hour < 12 ? 'am' : 'pm'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}:${minute} ${suffix}`
}
