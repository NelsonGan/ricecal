import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { OnboardingStep } from '@/features/onboarding'
import { type Profile, useAppState, useDispatch } from '@/mock'
import { Card, Slider, Stepper, Text, TextField } from '@/ui'

/** 03 ABOUT YOU */
export default function AboutStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const dispatch = useDispatch()
  const profile = useAppState((state) => state.profile)

  const patch = (next: Partial<Profile>) => dispatch({ type: 'updateProfile', patch: next })

  // The two numeric fields keep their raw text while focused. Clamping on every
  // keystroke would turn a half-typed "1" into "120" under the user's cursor.
  const [height, setHeight] = useState(String(profile.heightCm))
  const [weight, setWeight] = useState(String(profile.weightKg))

  const commitHeight = () => {
    const value = clamp(Number(height) || profile.heightCm, 120, 220)
    setHeight(String(value))
    patch({ heightCm: value })
  }

  const commitWeight = () => {
    const value = clamp(Number(weight) || profile.weightKg, 30, 200)
    setWeight(String(value))
    patch({ weightKg: value })
  }

  return (
    <OnboardingStep
      step={2}
      total={5}
      accent="water"
      title={t('about.title')}
      subtitle={t('about.subtitle')}
      primaryLabel={t('common:action.continue')}
      onPrimary={() => {
        // Commit before leaving: a user who taps Continue straight from the
        // keyboard never fires onBlur.
        commitHeight()
        commitWeight()
        router.push('/activity')
      }}
    >
      <View className="flex-row gap-3">
        <TextField
          containerClassName="flex-1"
          label={t('about.height')}
          keyboardType="number-pad"
          value={height}
          onChangeText={setHeight}
          onBlur={commitHeight}
          inputClassName="font-display text-[26px]"
          rightSlot={<Text variant="caption">{t('common:unit.cm')}</Text>}
        />
        <TextField
          containerClassName="flex-1"
          label={t('about.weight')}
          keyboardType="decimal-pad"
          value={weight}
          onChangeText={setWeight}
          onBlur={commitWeight}
          inputClassName="font-display text-[26px]"
          rightSlot={<Text variant="caption">{t('common:unit.kg')}</Text>}
        />
      </View>

      <Card title={t('about.age')}>
        <Stepper
          value={profile.age}
          onChange={(age) => patch({ age })}
          min={13}
          max={100}
          accessibilityLabel={t('about.age')}
          decrementLabel={t('common:a11y.decrease')}
          incrementLabel={t('common:a11y.increase')}
          step={1}
          format={(value) => t('about.ageValue', { count: value })}
        />
      </Card>

      <Card
        title={t('about.targetWeight')}
        action={
          <Text className="font-display text-[24px] leading-[29px] text-heading">
            {profile.targetWeightKg.toFixed(1)} {t('common:unit.kg')}
          </Text>
        }
      >
        <Slider
          value={profile.targetWeightKg}
          onChange={(targetWeightKg) => patch({ targetWeightKg })}
          min={40}
          max={120}
          step={0.5}
          // The card already says TARGET WEIGHT; a second label under it would
          // be the same words twice.
          accessibilityLabel={t('about.targetWeight')}
          format={(value) => `${value.toFixed(1)} ${t('common:unit.kg')}`}
        />
      </Card>
    </OnboardingStep>
  )
}

/** Keeps a mistyped height from producing a negative calorie budget. */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
