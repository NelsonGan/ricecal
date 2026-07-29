import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { OnboardingStep } from '@/features/onboarding'
import { useAppState, useDispatch } from '@/mock'
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
  const dispatch = useDispatch()
  const profile = useAppState((state) => state.profile)

  const toggle = (tag: string) => {
    const next = profile.foodStyles.includes(tag)
      ? profile.foodStyles.filter((existing) => existing !== tag)
      : [...profile.foodStyles, tag]
    dispatch({ type: 'updateProfile', patch: { foodStyles: next } })
  }

  return (
    <OnboardingStep
      step={4}
      total={5}
      accent="kaya"
      title={t('foodStyle.title')}
      subtitle={t('foodStyle.subtitle')}
      primaryLabel={t('common:action.continue')}
      onPrimary={() => router.push('/source')}
    >
      {/* Multi-select, so these are checkboxes wearing chips rather than
          radios — the role says so even though the shape does not. */}
      <View className="flex-row flex-wrap gap-2.5">
        {TAGS.map((tag) => (
          <Chip
            key={tag}
            tone="kaya"
            selected={profile.foodStyles.includes(tag)}
            onPress={() => toggle(tag)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: profile.foodStyles.includes(tag) }}
          >
            {t(`foodStyle.tags.${tag}`)}
          </Chip>
        ))}
      </View>

      <Card title={t('foodStyle.mealTimes')}>
        <View className="flex-row items-center justify-between">
          <Text variant="bodyStrong" className="text-[16px]">
            {profile.mealTimes.map((slot) => slot.time).join(', ')}
          </Text>
        </View>
      </Card>
    </OnboardingStep>
  )
}
