import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  bodyFrom,
  useCurrentWeight,
  useProfile,
  useSetTargets,
  useSettings,
  useTargets,
  useUpdateProfile,
  useUpdateSettings,
  useWeighIns,
} from '@/data'
import { count } from '@/features/activity'
import {
  type Budget,
  BudgetEditor,
  type BudgetFields,
  budgetFields,
  isRecommended,
  readBudget,
} from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { computeTargets, targetWeightRange, weeklyPace } from '@/lib/nutrition'
import { fromKg, showWeight, UNIT_KEY, unitFor } from '@/lib/units'
import {
  DEFAULT_WATER_ML,
  millilitres,
  WATER_GOAL_MAX_ML,
  WATER_GOAL_MIN_ML,
  WATER_GOAL_STEP_ML,
} from '@/lib/water'
import { AppBar, Button, Card, Screen, Skeleton, Slider, Stepper, Text, useToast } from '@/ui'

/** U2 GOALS */
export default function GoalsScreen() {
  const { t } = useTranslation(['profile', 'activity', 'common'])
  const goBack = useBack('/me')
  const toast = useToast()
  const { data: profile, isPending: profilePending } = useProfile()
  const { data: targets, isPending: targetsPending } = useTargets()
  const { data: settings, isPending: settingsPending } = useSettings()
  const { isPending: weightPending } = useWeighIns()
  const updateProfile = useUpdateProfile()
  const updateSettings = useUpdateSettings()
  const setTargets = useSetTargets()
  const weight = useCurrentWeight() ?? 0
  /**
   * Which unit this screen READS in. Everything it stores stays kilograms.
   *
   * This whole card printed `common:unit.kg` against an unconverted figure, so
   * an imperial account was shown "200.0 kg" beside a Me tab that had just
   * agreed its units were Imperial — the one number on the screen the user can
   * check against their own scale, in the unit they said they do not use.
   */
  const unit = unitFor(settings?.units)
  const unitLabel = t(UNIT_KEY[unit])

  /**
   * Nothing is editable until everything it is seeded from is here.
   *
   * The controls on this screen fall back to a budget of zero and a target
   * weight of nothing — so a user arriving before the queries answered did not
   * just see the wrong slider positions, they could drag one and save them. The
   * footer button waits with the cards for the same reason: Save wrote whatever
   * the placeholders happened to say.
   */
  const loading = profilePending || targetsPending || weightPending || settingsPending

  // Edited locally and committed on save, so backing out of the screen does not
  // silently move the user's budget. Seeded once the queries answer.
  //
  // `budget` is all four figures at once and `undefined` is "untouched", which is
  // what keeps a hand-set budget from being rewritten by somebody who came in to
  // change their water goal.
  const [budget, setBudget] = useState<BudgetFields | undefined>()
  const [targetWeight, setTargetWeight] = useState<number | undefined>()
  const [water, setWater] = useState<number | undefined>()
  const [steps, setSteps] = useState<number | undefined>()

  /**
   * Null when the user has never stated one, which is a real answer rather than
   * a missing one — the formula reads it as maintenance, which is the budget
   * every account predating the target already had. Defaulting it to the current
   * weight here, as this screen used to, would have written a target nobody
   * chose onto the profile the first time Save was pressed.
   */
  const storedTargetWeight =
    profile?.target_weight_kg == null ? null : Number(profile.target_weight_kg)

  /** What the formula is told. An untouched slider is not a statement. */
  const currentTargetWeight = targetWeight ?? storedTargetWeight
  /**
   * What the target slider can reach, and where its handle sits.
   *
   * The range follows the current weight, so an account above 120 kg can still
   * put their target where they already are — which is how a user says they have
   * no goal at all. The handle has to be somewhere, and the current weight is the
   * only honest place to put it when there is nothing to show; it is clamped into
   * the track either way, as the onboarding copy of this control does, so a
   * reader does not see a thumb pinned at one end beside a readout saying
   * otherwise.
   */
  const targetRange = targetWeightRange(weight)
  const targetWeightPosition = Math.min(
    targetRange.max,
    Math.max(targetRange.min, currentTargetWeight ?? weight),
  )
  const currentWater = water ?? targets?.waterMl ?? DEFAULT_WATER_ML
  const currentSteps = steps ?? settings?.step_goal ?? 8000

  // What the same formula the database runs would suggest for this body and this
  // target — named under the calorie box so a hand-set number has a reference,
  // and what the editor's reset link fills all four fields with. Against the
  // target being EDITED rather than the stored one, so the reference moves as it
  // does.
  const body = bodyFrom(profile, weight, { targetWeightKg: currentTargetWeight })
  const recommended: Budget = body
    ? computeTargets(body)
    : { kcal: 0, carbs: 0, protein: 0, fat: 0 }
  const pace = body ? weeklyPace(body) : 0

  /**
   * Whether the plan under the budget is not the one that produced it.
   *
   * The bug this exists for: the calorie slider was seeded from the STORED
   * budget and nothing re-seeded it, so changing the plan moved the
   * "recommended" caption and left the number above it where it was — and then
   * Save wrote that stale figure, flagged custom, which stopped the database
   * ever recomputing it again. A user changing their goal got a budget built for
   * the goal they had just abandoned, permanently.
   */
  const planChanged = currentTargetWeight !== storedTargetWeight

  /**
   * The four figures on screen: the user's own if they have typed any of them,
   * otherwise what this plan asks for.
   *
   * Editing the target weight clears them — see the handler below — so
   * "otherwise" means the recommendation for the plan as edited, and falls back
   * to the stored budget only while nothing has been touched. That fallback is
   * what preserves a hand-set number for someone who came in to change their
   * water goal.
   */
  const stored: Budget | null = targets
    ? { kcal: targets.kcal, carbs: targets.carbs, protein: targets.protein, fat: targets.fat }
    : null
  const shown = budget ?? budgetFields(planChanged ? recommended : (stored ?? recommended))
  const currentBudget = readBudget(shown, recommended)

  // A plan edit takes the whole budget back under the formula's control. The
  // alternative — leaving typed numbers in place — is how you end up with a
  // budget for the old target wearing the new target's name.
  const changeTargetWeight = (value: number) => {
    setTargetWeight(value)
    setBudget(undefined)
  }

  /**
   * `is_custom` is the flag the recompute trigger reads and stops on, and it is
   * earned rather than assumed. Written as `true` unconditionally, opening this
   * screen and pressing Save froze the calorie budget for good.
   *
   * Read off what the fields SAY rather than off whether they were touched, so
   * that typing a number and putting it back — which is what the reset link does
   * — leaves the budget automatic. Compared against this client's copy of the
   * formula, which can differ from the database's by a rounding step when the
   * two compute age against different clocks; that is the same rounding step
   * `Use recommended` just wrote into the fields, so the comparison holds.
   */
  const isCustom =
    budget !== undefined
      ? !isRecommended(budget, recommended)
      : planChanged
        ? false
        : (targets?.isCustom ?? false)

  const save = async () => {
    // Only when it actually moved. An unchanged profile write would fire the
    // recompute trigger for nothing, and a user who has never set a target would
    // send an empty patch.
    if (planChanged && currentTargetWeight !== null) {
      await updateProfile.mutateAsync({ targetWeightKg: currentTargetWeight })
    }
    // Written after the profile, whose own change fires the trigger that would
    // otherwise recompute over the top of a deliberate figure.
    await setTargets.mutateAsync({
      ...currentBudget,
      waterMl: currentWater,
      isCustom,
    })
    // Not part of the calorie budget, and stored beside the display preferences
    // rather than in `daily_goals` — but it is a goal, and this is the screen
    // called Goals and targets. It was only reachable from the health-sync
    // screen before, which is where you go to connect a store rather than to
    // decide what to aim for.
    await updateSettings.mutateAsync({ step_goal: currentSteps })
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
            <Skeleton className="h-[172px] w-full" />
          </Card>
        </>
      ) : (
        <>
          {/* Four typed figures rather than a calorie slider over a read-only
              list of grams. The list was stale by construction — it drew the
              STORED macros beside a calorie total the slider had already moved —
              and a slider cannot span the range the weight field now accepts:
              1,200 to 3,500 stopped short of what the formula asks of a large
              body long before it stopped short of 500 kg. */}
          <BudgetEditor
            value={shown}
            onChange={setBudget}
            recommended={recommended}
            onReset={() => setBudget(budgetFields(recommended))}
          />

          {/* The whole of the weight goal: where you are, where you want to be,
              and what that costs per week. There was a lose/maintain/gain
              control above this slider, and it could only ever agree with the
              two weights or contradict them — asking the same question twice
              and then having to decide which answer to believe. */}
          <Card title={t('profile:goals.goal')}>
            <View className="flex-row items-center justify-between">
              <Text variant="label" className="text-muted">
                {t('profile:goals.currentWeight')}
              </Text>
              <Text variant="label">
                {showWeight(weight, unit)} {unitLabel}
              </Text>
            </View>

            <View className="flex-row items-center justify-between">
              <Text variant="label" className="text-muted">
                {t('profile:goals.targetWeight')}
              </Text>
              <Text variant="label">
                {showWeight(targetWeightPosition, unit)} {unitLabel}
              </Text>
            </View>
            <Slider
              value={targetWeightPosition}
              onChange={changeTargetWeight}
              min={targetRange.min}
              max={targetRange.max}
              step={0.5}
              accessibilityLabel={t('profile:goals.targetWeight')}
              // `format` draws the thumb's bubble AND the two bound labels under
              // the track, so converting here is what turns "40.0 kg / 120.0 kg"
              // into pounds as well. The value handed in is still kilograms.
              format={(value) => `${showWeight(value, unit)} ${unitLabel}`}
            />

            {/* The pace is what the gap between those two actually buys, and
                without it both the direction and the taper are invisible: a user
                two kilos out sees a budget move for no stated reason. Shown for
                the target being edited, so it answers the drag immediately
                rather than on save. */}
            <View className="flex-row items-center justify-between">
              <Text variant="label" className="text-muted">
                {t('profile:goals.weeklyPace')}
              </Text>
              <Text variant="label">
                {pace === 0
                  ? t('profile:goals.paceHolding')
                  : t(pace < 0 ? 'profile:goals.paceLosing' : 'profile:goals.paceGaining', {
                      // Two decimals rather than `showWeight`'s one: a pace is a
                      // fraction of a unit a week, and rounded to 0.1 the
                      // difference between a gentle plan and a brisk one
                      // disappears.
                      value: fromKg(Math.abs(pace), unit).toFixed(2),
                      unit: unitLabel,
                    })}
              </Text>
            </View>
          </Card>

          <Card title={t('profile:goals.other')}>
            <Text variant="label">{t('profile:goals.waterGoal')}</Text>
            {/* A quarter of a litre a step, which is what makes the whole range
                22 taps rather than 55 — and it lands on every figure anybody
                actually names. The bounds are the column's own check
                constraint, narrowed: `daily_goals` allows 250 to 8,000, and a
                stepper that can reach a goal nobody should be nudged towards is
                a stepper that suggests it. */}
            <Stepper
              value={currentWater}
              onChange={setWater}
              min={WATER_GOAL_MIN_ML}
              max={WATER_GOAL_MAX_ML}
              step={WATER_GOAL_STEP_ML}
              accessibilityLabel={t('profile:goals.waterGoal')}
              decrementLabel={t('common:a11y.decrease')}
              incrementLabel={t('common:a11y.increase')}
              format={(value) => t('common:volume.ml', { value: millilitres(value) })}
            />

            <Text variant="label">{t('activity:settings.stepGoal')}</Text>
            {/* A stepper rather than a slider, and the same bounds as the copy on
                the health screen: a step goal is a round number people name —
                8,000, 10,000 — not a value swept to. */}
            <Stepper
              value={currentSteps}
              onChange={setSteps}
              min={1000}
              max={30000}
              step={500}
              accessibilityLabel={t('activity:settings.stepGoal')}
              decrementLabel={t('common:a11y.decrease')}
              incrementLabel={t('common:a11y.increase')}
              format={count}
            />
          </Card>
        </>
      )}
    </Screen>
  )
}
