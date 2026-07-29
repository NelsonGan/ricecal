import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useBack } from '@/lib/navigation'
import { computeTargets, type Goal, useAppState, useDispatch } from '@/mock'
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
  const dispatch = useDispatch()
  const toast = useToast()
  const { profile, targets } = useAppState((state) => ({
    profile: state.profile,
    targets: state.targets,
  }))

  // Edited locally and committed on save, so backing out of the screen does not
  // silently move the user's budget.
  const [kcal, setKcal] = useState(targets.kcal)
  const [goal, setGoal] = useState(profile.goal)
  const [targetWeight, setTargetWeight] = useState(profile.targetWeightKg)
  const [water, setWater] = useState(targets.waterGlasses)
  const [steps, setSteps] = useState(targets.steps)

  const recommended = computeTargets({ ...profile, goal }).kcal

  const macros = [
    { key: 'carbs', label: t('common:macro.carbs'), grams: targets.carbs, dot: 'bg-kaya' },
    {
      key: 'protein',
      label: t('common:macro.protein'),
      grams: targets.protein,
      dot: 'bg-hibiscus',
    },
    { key: 'fat', label: t('common:macro.fat'), grams: targets.fat, dot: 'bg-teh' },
  ]

  const save = () => {
    // The profile change would normally recompute the budget; the user has just
    // set it by hand, so it is passed through untouched.
    dispatch({
      type: 'updateProfile',
      patch: { goal, targetWeightKg: targetWeight },
      recomputeTargets: false,
    })
    dispatch({ type: 'updateTargets', patch: { kcal, waterGlasses: water, steps } })
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
          <Text variant="title">{kcal.toLocaleString()}</Text>
          <Text variant="caption">
            {t('profile:goals.recommended', { value: recommended.toLocaleString() })}
          </Text>
        </View>
        <Slider
          value={kcal}
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
                percent: Math.round(((macro.grams * (macro.key === 'fat' ? 9 : 4)) / kcal) * 100),
              })}
            </Text>
          </View>
        ))}
      </Card>

      <Card title={t('profile:goals.goal')}>
        <SegmentedControl
          options={GOALS.map((option) => ({ value: option, label: t(`profile:goals.${option}`) }))}
          value={goal === 'track' ? 'maintain' : goal}
          onChange={setGoal}
          accessibilityLabel={t('profile:goals.goal')}
        />

        <View className="flex-row items-center justify-between">
          <Text variant="label" className="text-muted">
            {t('profile:goals.targetWeight')}
          </Text>
          <Text variant="label">
            {targetWeight.toFixed(1)} {t('common:unit.kg')}
          </Text>
        </View>
        <Slider
          value={targetWeight}
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
          value={water}
          onChange={setWater}
          min={4}
          max={16}
          accessibilityLabel={t('profile:goals.waterGoal')}
          decrementLabel={t('common:a11y.decrease')}
          incrementLabel={t('common:a11y.increase')}
          format={(value) => t('common:count.glasses', { count: value })}
        />

        <Text variant="label">{t('profile:goals.stepGoal')}</Text>
        <Stepper
          value={steps}
          onChange={setSteps}
          step={500}
          min={2000}
          max={25000}
          accessibilityLabel={t('profile:goals.stepGoal')}
          decrementLabel={t('common:a11y.decrease')}
          incrementLabel={t('common:a11y.increase')}
          format={(value) => value.toLocaleString()}
        />
      </Card>
    </Screen>
  )
}
