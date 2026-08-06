import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Sex } from '@/data'
import { OnboardingStep, useOnboardingDraft } from '@/features/onboarding'
import { Card, SegmentedControl, Slider, Stepper, Text, TextField } from '@/ui'

/**
 * The bounds each control answers within.
 *
 * Height and weight keep a mistyped field from producing a negative calorie
 * budget. The target range is narrower than the weight one because it is
 * dragged rather than typed, and 170 kg of travel under a thumb is not a
 * control anybody can aim.
 */
const HEIGHT = { min: 120, max: 220 }
const WEIGHT = { min: 30, max: 200 }
const TARGET = { min: 40, max: 120 }

/** Plausible rather than empty: every control here needs somewhere to start. */
const FALLBACK = { heightCm: 164, weightKg: 65, age: 29, sex: 'female' as Sex }

/** 02 ABOUT YOU */
export default function AboutStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const { draft, patch } = useOnboardingDraft()

  /**
   * The two numeric fields keep their raw text while being edited.
   *
   * Absent until touched, so the stored answer shows through until then.
   * Clamping on every keystroke would turn a half-typed "1" into "120" under
   * the user's cursor, which is why these are strings and not numbers.
   */
  const [typed, setTyped] = useState<{ height?: string; weight?: string }>({})

  const savedHeightCm = draft.heightCm ?? FALLBACK.heightCm
  const savedWeightKg = draft.weightKg ?? FALLBACK.weightKg

  const heightText = typed.height ?? String(savedHeightCm)
  const weightText = typed.weight ?? String(savedWeightKg)
  const sex: Sex = draft.sex ?? FALLBACK.sex
  const age = draft.age ?? FALLBACK.age

  // What the two fields mean once read as numbers. An empty or unparseable
  // field falls back to the stored answer rather than becoming 0, which would
  // clamp to the minimum the moment the user cleared it to retype.
  const heightCm = clamp(Number(heightText) || savedHeightCm, HEIGHT)
  const weightKg = clamp(Number(weightText) || savedWeightKg, WEIGHT)
  /**
   * Defaults to standing still, which is now a plan rather than a placeholder.
   *
   * This slider and the weight field beside it are the whole of the calorie
   * goal — there is no lose/maintain/gain screen any more, because it could only
   * agree with these two numbers or contradict them. So leaving the thumb where
   * it starts says "keep me where I am", and it says it in the same place the
   * user can see their current weight, which is where that sentence is easiest
   * to mean. Clamped into the slider's own range so the thumb and the readout
   * beside it cannot disagree.
   */
  const targetWeightKg = draft.targetWeightKg ?? clamp(weightKg, TARGET)

  /**
   * Commits everything the screen is SHOWING, not only what was touched.
   *
   * The controls display sensible defaults nobody chose, and leaving those
   * unrecorded means `sex` or the birth date is missing at the flush — the
   * database's budget trigger reads exactly those and gives up quietly, so the
   * target screen would have no number and nothing to explain it.
   *
   * Reading the fields here rather than trusting a blur is what covers the user
   * who taps Continue straight from the keyboard, which never fires one.
   */
  const save = () => {
    patch({ heightCm, weightKg, sex, age, targetWeightKg })
    // Group-qualified, because `activity` is a route name this app uses TWICE —
    // here and as the tab. Route groups add no path segment, so a bare
    // `/activity` is ambiguous and expo-router resolves it to whichever it
    // resolves it to. It happened to land here, which meant the tab's callers
    // were the broken ones; naming the group on both sides is what stops the
    // next reshuffle silently swapping which.
    router.push('/(onboarding)/activity')
  }

  return (
    <OnboardingStep
      step={1}
      total={4}
      accent="water"
      title={t('about.title')}
      subtitle={t('about.subtitle')}
      primaryLabel={t('common:action.continue')}
      onPrimary={save}
    >
      <View className="flex-row gap-3">
        <TextField
          containerClassName="flex-1"
          label={t('about.height')}
          keyboardType="number-pad"
          value={heightText}
          onChangeText={(height) => setTyped((current) => ({ ...current, height }))}
          // Blur is where the clamp becomes visible: "show me what you
          // understood". Continue re-reads the field either way.
          onBlur={() => setTyped((current) => ({ ...current, height: String(heightCm) }))}
          inputClassName="font-display text-[26px]"
          rightSlot={<Text variant="caption">{t('common:unit.cm')}</Text>}
        />
        <TextField
          containerClassName="flex-1"
          label={t('about.weight')}
          keyboardType="decimal-pad"
          value={weightText}
          onChangeText={(weight) => setTyped((current) => ({ ...current, weight }))}
          onBlur={() => setTyped((current) => ({ ...current, weight: String(weightKg) }))}
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
          onChange={(next) => patch({ age: next })}
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
          // `Slider` reports every frame of a drag, which is why this writes to
          // the draft and not to the network: the same handler against a profile
          // update was a request, and a budget recompute, per frame.
          onChange={(next) => patch({ targetWeightKg: next })}
          min={TARGET.min}
          max={TARGET.max}
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

function clamp(value: number, bounds: { min: number; max: number }) {
  return Math.min(bounds.max, Math.max(bounds.min, value))
}
