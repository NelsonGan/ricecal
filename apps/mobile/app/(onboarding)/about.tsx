import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  type ProfilePatch,
  type Sex,
  useCurrentWeight,
  useLogWeight,
  useProfile,
  useUpdateProfile,
} from '@/data'
import { OnboardingStep } from '@/features/onboarding'
import { ageFrom, birthDateFromAge } from '@/lib/nutrition'
import { Card, SegmentedControl, Slider, Stepper, Text, TextField } from '@/ui'

/** 03 ABOUT YOU */
export default function AboutStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const logWeight = useLogWeight()
  const storedWeight = useCurrentWeight()

  const patch = (next: ProfilePatch) => updateProfile.mutate(next)

  // Defaults that are plausible rather than empty: this screen is a set of
  // sliders and steppers, and every one of them needs somewhere to start.
  const heightCm = Number(profile?.height_cm ?? 164)
  const weightKg = storedWeight ?? 65
  const age = ageFrom(profile?.birth_date ?? null) || 29
  const targetWeightKg = Number(profile?.target_weight_kg ?? weightKg)
  const sex: Sex = profile?.sex ?? 'female'

  // The two numeric fields keep their raw text while focused. Clamping on every
  // keystroke would turn a half-typed "1" into "120" under the user's cursor.
  const [height, setHeight] = useState(String(heightCm))
  const [weight, setWeight] = useState(String(weightKg))

  const commitHeight = () => {
    const value = clamp(Number(height) || heightCm, 120, 220)
    setHeight(String(value))
    patch({ heightCm: value })
  }

  /**
   * Weight is a weigh-in, not a profile column.
   *
   * There is no `weight_kg` on `profiles` at all: current weight is the newest
   * row in `weight_logs`, so onboarding's answer becomes the first reading —
   * which also gives the weight chart a starting point for free, and is what
   * lets the database compute the calorie budget.
   */
  const commitWeight = () => {
    const value = clamp(Number(weight) || weightKg, 30, 200)
    setWeight(String(value))
    logWeight.mutate({ kg: value })
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
        // Commit everything the screen is SHOWING, not only what was touched.
        //
        // Two reasons. A user who taps Continue straight from the keyboard
        // never fires onBlur, so the fields need flushing. And the sliders and
        // steppers display sensible defaults that were never written — leaving
        // those unsaved means `sex` or `birth_date` stays null, and the
        // database's budget trigger reads exactly those and gives up quietly:
        // the target screen then shows 0 kcal with nothing to explain it.
        commitHeight()
        commitWeight()
        patch({ sex, birthDate: birthDateFromAge(age), targetWeightKg })
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

      {/* Asked because the budget cannot be computed without it: Mifflin-St
          Jeor branches on sex, and `compute_targets()` returns nothing at all
          while the column is null. */}
      <Card title={t('about.sex')}>
        <SegmentedControl
          options={[
            { value: 'female', label: t('about.female') },
            { value: 'male', label: t('about.male') },
          ]}
          value={sex}
          onChange={(next) => patch({ sex: next as Sex })}
          accessibilityLabel={t('about.sex')}
        />
      </Card>

      <Card title={t('about.age')}>
        <Stepper
          value={age}
          // Stored as a birth date: an integer age is wrong within a year of
          // being written and nothing would ever correct it.
          onChange={(next) => patch({ birthDate: birthDateFromAge(next) })}
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
            {targetWeightKg.toFixed(1)} {t('common:unit.kg')}
          </Text>
        }
      >
        <Slider
          value={targetWeightKg}
          onChange={(next) => patch({ targetWeightKg: next })}
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
