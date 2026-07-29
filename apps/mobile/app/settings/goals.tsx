import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  type Goal,
  useCurrentWeight,
  useProfile,
  useSetTargets,
  useTargets,
  useUpdateProfile,
} from '@/data'
import { useBack } from '@/lib/navigation'
import { ageFrom, computeTargets } from '@/lib/nutrition'
import {
  AppBar,
  Button,
  Card,
  Screen,
  SegmentedControl,
  Slider,
  Stepper,
  Text,
  useToast,
} from '@/ui'

const GOALS: Extract<Goal, 'lose' | 'maintain' | 'gain'>[] = ['lose', 'maintain', 'gain']

/** U2 GOALS */
export default function GoalsScreen() {
  const { t } = useTranslation(['profile', 'common'])
  const goBack = useBack('/me')
  const toast = useToast()
  const { data: profile } = useProfile()
  const { data: targets } = useTargets()
  const updateProfile = useUpdateProfile()
  const setTargets = useSetTargets()
  const weight = useCurrentWeight() ?? 0

  // Edited locally and committed on save, so backing out of the screen does not
  // silently move the user's budget. Seeded once the queries answer.
  const [kcal, setKcal] = useState<number | undefined>()
  const [goal, setGoal] = useState<Goal | undefined>()
  const [targetWeight, setTargetWeight] = useState<number | undefined>()
  const [water, setWater] = useState<number | undefined>()

  const currentKcal = kcal ?? targets?.kcal ?? 0
  const currentGoal = goal ?? profile?.weight_goal ?? 'maintain'
  const currentTargetWeight = targetWeight ?? Number(profile?.target_weight_kg ?? weight)
  const currentWater = water ?? targets?.waterGlasses ?? 8

  // What the same formula the database runs would suggest for this body and
  // this goal — shown beside the slider so a hand-set number has a reference.
  const recommended = profile
    ? computeTargets({
        sex: profile.sex ?? 'female',
        weightKg: weight,
        heightCm: Number(profile.height_cm ?? 0),
        age: ageFrom(profile.birth_date),
        activity:
          profile.activity_level === 'on_feet'
            ? 'onFeet'
            : profile.activity_level === 'very_active'
              ? 'veryActive'
              : profile.activity_level,
        goal: currentGoal,
      }).kcal
    : 0

  const macros = [
    { key: 'carbs', label: t('common:macro.carbs'), grams: targets?.carbs ?? 0, dot: 'bg-kaya' },
    {
      key: 'protein',
      label: t('common:macro.protein'),
      grams: targets?.protein ?? 0,
      dot: 'bg-hibiscus',
    },
    { key: 'fat', label: t('common:macro.fat'), grams: targets?.fat ?? 0, dot: 'bg-teh' },
  ]

  const save = async () => {
    await updateProfile.mutateAsync({ goal: currentGoal, targetWeightKg: currentTargetWeight })
    // `is_custom` is the flag the recompute trigger reads and stops on. Setting
    // it here is what stops tomorrow's weigh-in overwriting a number the user
    // typed themselves — and it has to be written after the profile, whose own
    // change would otherwise recompute over the top of it.
    await setTargets.mutateAsync({
      kcal: currentKcal,
      // The macro split follows the calorie total, in the same proportions the
      // database would have used.
      carbs: Math.round((currentKcal * 0.47) / 4),
      protein: Math.round((currentKcal * 0.22) / 4),
      fat: Math.round((currentKcal * 0.31) / 9),
      waterGlasses: currentWater,
      isCustom: true,
    })
    toast.show({ title: t('profile:goals.saved'), tone: 'success' })
    goBack()
  }

  return (
    <Screen
      footer={
        <Button fullWidth onPress={save}>
          {t('common:action.save')}
        </Button>
      }
    >
      <AppBar
        title={t('profile:goals.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      <Card title={t('profile:goals.dailyCalories')}>
        <View className="flex-row items-baseline justify-between">
          <Text variant="title">{currentKcal.toLocaleString()}</Text>
          <Text variant="caption">
            {t('profile:goals.recommended', { value: recommended.toLocaleString() })}
          </Text>
        </View>
        <Slider
          value={currentKcal}
          onChange={setKcal}
          min={1200}
          max={3500}
          step={10}
          // The card heading and the figure above already name this; a slider
          // label would be the third copy of the same words.
          accessibilityLabel={t('profile:goals.dailyCalories')}
          format={(value) => `${value.toLocaleString()} ${t('common:unit.kcal')}`}
        />
      </Card>

      <Card title={t('profile:goals.macroTargets')}>
        {macros.map((macro) => (
          <View key={macro.key} className="flex-row items-center gap-3">
            <View className={`h-3 w-3 rounded ${macro.dot}`} />
            <Text variant="label" className="flex-1">
              {macro.label}
            </Text>
            <Text variant="meta">
              {t('profile:goals.macroValue', {
                grams: macro.grams,
                percent: Math.round(
                  ((macro.grams * (macro.key === 'fat' ? 9 : 4)) / (currentKcal || 1)) * 100,
                ),
              })}
            </Text>
          </View>
        ))}
      </Card>

      <Card title={t('profile:goals.goal')}>
        <SegmentedControl
          options={GOALS.map((option) => ({ value: option, label: t(`profile:goals.${option}`) }))}
          // "Just tracking" has no slider position of its own; it sits where
          // maintain does, and picking any option here commits to that goal.
          value={currentGoal === 'track' ? 'maintain' : currentGoal}
          onChange={(value) => setGoal(value as Goal)}
          accessibilityLabel={t('profile:goals.goal')}
        />

        <View className="flex-row items-center justify-between">
          <Text variant="label" className="text-muted">
            {t('profile:goals.targetWeight')}
          </Text>
          <Text variant="label">
            {currentTargetWeight.toFixed(1)} {t('common:unit.kg')}
          </Text>
        </View>
        <Slider
          value={currentTargetWeight}
          onChange={setTargetWeight}
          min={40}
          max={120}
          step={0.5}
          accessibilityLabel={t('profile:goals.targetWeight')}
          format={(value) => `${value.toFixed(1)} ${t('common:unit.kg')}`}
        />
      </Card>

      <Card title={t('profile:goals.other')}>
        <Text variant="label">{t('profile:goals.waterGoal')}</Text>
        <Stepper
          value={currentWater}
          onChange={setWater}
          min={4}
          max={16}
          accessibilityLabel={t('profile:goals.waterGoal')}
          decrementLabel={t('common:a11y.decrease')}
          incrementLabel={t('common:a11y.increase')}
          format={(value) => t('common:count.glasses', { count: value })}
        />
      </Card>
    </Screen>
  )
}
