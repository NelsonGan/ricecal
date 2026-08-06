import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  bodyFrom,
  type Goal,
  useCurrentWeight,
  useProfile,
  useSetTargets,
  useTargets,
  useUpdateProfile,
  useWeighIns,
} from '@/data'
import { useBack } from '@/lib/navigation'
import { computeTargets, macroSplit, weeklyPace } from '@/lib/nutrition'
import {
  AppBar,
  Button,
  Card,
  Screen,
  SegmentedControl,
  Skeleton,
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
  const { data: profile, isPending: profilePending } = useProfile()
  const { data: targets, isPending: targetsPending } = useTargets()
  const { isPending: weightPending } = useWeighIns()
  const updateProfile = useUpdateProfile()
  const setTargets = useSetTargets()
  const weight = useCurrentWeight() ?? 0

  /**
   * Nothing is editable until everything it is seeded from is here.
   *
   * The controls on this screen fall back to a budget of zero, a goal of
   * "maintain" and a target weight of nothing — so a user arriving before the
   * queries answered did not just see the wrong slider positions, they could
   * drag one and save them. The footer button waits with the cards for the same
   * reason: Save wrote whatever the placeholders happened to say.
   */
  const loading = profilePending || targetsPending || weightPending

  // Edited locally and committed on save, so backing out of the screen does not
  // silently move the user's budget. Seeded once the queries answer.
  const [kcal, setKcal] = useState<number | undefined>()
  const [goal, setGoal] = useState<Goal | undefined>()
  const [targetWeight, setTargetWeight] = useState<number | undefined>()
  const [water, setWater] = useState<number | undefined>()

  const storedGoal = profile?.weight_goal ?? 'maintain'
  /**
   * Null when the user has never stated one, which is a real answer rather than
   * a missing one — the formula reads it as "no target" and falls back to the
   * goal's own pace, which is the budget every account predating this already
   * had. Defaulting it to the current weight here, as this screen used to,
   * would tell the formula the target was already reached and quietly convert
   * every one of those accounts to a maintain plan the first time Save was
   * pressed.
   */
  const storedTargetWeight =
    profile?.target_weight_kg == null ? null : Number(profile.target_weight_kg)

  const currentGoal = goal ?? storedGoal
  /** What the formula is told. An untouched slider is not a statement. */
  const currentTargetWeight = targetWeight ?? storedTargetWeight
  /**
   * Where the handle sits. It has to be somewhere, and the current weight is the
   * only honest place to put it when there is nothing to show.
   */
  const targetWeightPosition = currentTargetWeight ?? weight
  const currentWater = water ?? targets?.waterGlasses ?? 8

  // What the same formula the database runs would suggest for this body and this
  // PLAN — shown beside the slider so a hand-set number has a reference. Against
  // the goal and the target weight being edited rather than the stored ones, so
  // the reference moves as they do.
  const body = bodyFrom(profile, weight, {
    goal: currentGoal,
    targetWeightKg: currentTargetWeight,
  })
  const recommended = body ? computeTargets(body).kcal : 0
  const pace = body ? weeklyPace(body) : 0

  /**
   * Whether the plan under the budget is not the one that produced it.
   *
   * The bug this exists for: the calorie slider was seeded from the STORED
   * budget and nothing re-seeded it, so switching Lose to Gain moved the
   * "recommended" caption and left the number above it where it was — and then
   * Save wrote that stale figure, flagged custom, which stopped the database
   * ever recomputing it again. A user changing their goal got a budget built for
   * the goal they had just abandoned, permanently.
   */
  const planChanged = currentGoal !== storedGoal || currentTargetWeight !== storedTargetWeight

  /**
   * The budget on screen: the user's own number if they have dragged the slider,
   * otherwise what this plan asks for.
   *
   * Editing the goal or the target weight clears `kcal` — see the two handlers
   * below — so "otherwise" means the recommendation for the plan as edited, and
   * falls back to the stored budget only while nothing has been touched. That
   * fallback is what preserves a hand-set number for someone who came in to
   * change their water goal.
   */
  const currentKcal = kcal ?? (planChanged ? recommended : (targets?.kcal ?? 0))

  // A plan edit takes the calorie budget back under the formula's control. The
  // alternative — leaving a dragged number in place — is how you end up with a
  // budget for the old goal wearing the new goal's name.
  const changeGoal = (value: Goal) => {
    setGoal(value)
    setKcal(undefined)
  }

  const changeTargetWeight = (value: number) => {
    setTargetWeight(value)
    setKcal(undefined)
  }

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
    // `undefined` leaves the column alone rather than writing one — see
    // `storedTargetWeight` above for why stamping the current weight in is not
    // the harmless default it looks like.
    await updateProfile.mutateAsync({
      goal: currentGoal,
      targetWeightKg: currentTargetWeight ?? undefined,
    })
    /**
     * `is_custom` is the flag the recompute trigger reads and stops on, and it
     * is EARNED rather than assumed.
     *
     * It used to be written as `true` unconditionally, which meant opening this
     * screen and pressing Save — to change the water goal, or to change nothing
     * at all — froze the calorie budget for good: no later weigh-in, and no
     * later change of goal, could move it again. Setting it only when the number
     * differs from what the formula asks for is what keeps that flag meaning
     * "the user overrode this".
     *
     * Written after the profile either way, whose own change fires the trigger
     * that would otherwise recompute over the top of a deliberate figure.
     */
    await setTargets.mutateAsync({
      kcal: currentKcal,
      // Through the same splitter the automatic budget uses, so a hand-set
      // calorie total still gets protein from body weight rather than from a
      // share of energy.
      ...macroSplit(currentKcal, weight),
      waterGlasses: currentWater,
      isCustom: currentKcal !== recommended,
    })
    toast.show({ title: t('profile:goals.saved'), tone: 'success' })
    goBack()
  }

  return (
    <Screen
      footer={
        <Button fullWidth onPress={save} disabled={loading}>
          {t('common:action.save')}
        </Button>
      }
    >
      <AppBar
        title={t('profile:goals.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      {loading ? (
        <>
          {/* One block per card, at the height each will be, so the screen does
              not reflow under the reader's thumb when the answers land. */}
          <Card title={t('profile:goals.dailyCalories')}>
            <Skeleton className="h-[68px] w-full" />
          </Card>
          <Card title={t('profile:goals.macroTargets')}>
            <Skeleton className="h-[72px] w-full" />
          </Card>
          <Card title={t('profile:goals.goal')}>
            <Skeleton className="h-[124px] w-full" />
          </Card>
          <Card title={t('profile:goals.other')}>
            <Skeleton className="h-[76px] w-full" />
          </Card>
        </>
      ) : (
        <>
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
              options={GOALS.map((option) => ({
                value: option,
                label: t(`profile:goals.${option}`),
              }))}
              // "Just tracking" has no slider position of its own; it sits where
              // maintain does, and picking any option here commits to that goal.
              value={currentGoal === 'track' ? 'maintain' : currentGoal}
              onChange={(value) => changeGoal(value as Goal)}
              accessibilityLabel={t('profile:goals.goal')}
            />

            <View className="flex-row items-center justify-between">
              <Text variant="label" className="text-muted">
                {t('profile:goals.targetWeight')}
              </Text>
              <Text variant="label">
                {targetWeightPosition.toFixed(1)} {t('common:unit.kg')}
              </Text>
            </View>
            <Slider
              value={targetWeightPosition}
              onChange={changeTargetWeight}
              min={40}
              max={120}
              step={0.5}
              accessibilityLabel={t('profile:goals.targetWeight')}
              format={(value) => `${value.toFixed(1)} ${t('common:unit.kg')}`}
            />

            {/* The pace is what the target weight actually buys, and without it
                the taper is invisible: a user two kilos out sees a budget move
                for no stated reason. Shown for the plan being edited, so it
                answers the segmented control immediately rather than on save. */}
            <View className="flex-row items-center justify-between">
              <Text variant="label" className="text-muted">
                {t('profile:goals.weeklyPace')}
              </Text>
              <Text variant="label">
                {pace === 0
                  ? t('profile:goals.paceHolding')
                  : t('profile:goals.paceValue', { value: Math.abs(pace).toFixed(2) })}
              </Text>
            </View>
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
        </>
      )}
    </Screen>
  )
}
