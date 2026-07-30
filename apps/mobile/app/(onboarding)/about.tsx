import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Sex, useCurrentWeight, useLogWeight, useProfile, useUpdateProfile } from '@/data'
import { OnboardingStep } from '@/features/onboarding'
import { ageFrom, birthDateFromAge } from '@/lib/nutrition'
import { Card, SegmentedControl, Slider, Stepper, Text, TextField, useToast } from '@/ui'

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

/**
 * What the user has changed, before any of it is saved.
 *
 * Every key is absent until touched and the screen falls back to the stored
 * answer, which is what keeps the placeholders above from being frozen in.
 * `useState` runs once — on a render where the newest weigh-in has usually not
 * arrived, since that is a second query and the router only waits for the
 * profile — so an initial value copied from it would still read 65 kg for a
 * user who weighs 80, and Continue would write that back over the real reading.
 */
type Draft = {
  /**
   * Raw text, not a number: clamping on every keystroke would turn a half-typed
   * "1" into "120" under the user's cursor.
   */
  height?: string
  weight?: string
  sex?: Sex
  age?: number
  targetWeightKg?: number
}

/** 03 ABOUT YOU */
export default function AboutStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const toast = useToast()
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const logWeight = useLogWeight()
  const storedWeight = useCurrentWeight()

  const [draft, setDraft] = useState<Draft>({})
  const edit = (next: Draft) => setDraft((current) => ({ ...current, ...next }))

  const savedHeightCm = Number(profile?.height_cm ?? FALLBACK.heightCm)
  const savedWeightKg = storedWeight ?? FALLBACK.weightKg

  const heightText = draft.height ?? String(savedHeightCm)
  const weightText = draft.weight ?? String(savedWeightKg)
  const sex: Sex = draft.sex ?? profile?.sex ?? FALLBACK.sex
  const age = draft.age ?? (ageFrom(profile?.birth_date ?? null) || FALLBACK.age)

  // What the two fields mean once read as numbers. An empty or unparseable
  // field falls back to the stored answer rather than becoming 0, which would
  // clamp to the minimum the moment the user cleared it to retype.
  const heightCm = clamp(Number(heightText) || savedHeightCm, HEIGHT)
  const weightKg = clamp(Number(weightText) || savedWeightKg, WEIGHT)
  // Defaults to standing still. Clamped into the slider's own range so the
  // thumb and the readout beside it cannot disagree.
  const targetWeightKg =
    draft.targetWeightKg ?? clamp(Number(profile?.target_weight_kg ?? weightKg), TARGET)

  const saving = updateProfile.isPending || logWeight.isPending

  /**
   * One write per store, on Continue, for everything the screen is SHOWING.
   *
   * Not on every interaction. `Slider` reports every frame of a drag, so a
   * profile update per change is one request per frame, each one recomputing the
   * budget in the database — and out-of-order responses mean the value that
   * lands last is not the one the finger ended on.
   *
   * Showing rather than touched, because the controls display sensible defaults
   * nobody chose. Leaving those unsaved means `sex` or `birth_date` stays null,
   * and the database's budget trigger reads exactly those and gives up quietly:
   * the target screen then shows no budget with nothing to explain it.
   */
  const save = async () => {
    try {
      await Promise.all([
        updateProfile.mutateAsync({
          heightCm,
          sex,
          // Stored as a birth date: an integer age is wrong within a year of
          // being written and nothing would ever correct it.
          birthDate: birthDateFromAge(age),
          targetWeightKg,
        }),
        /**
         * Weight is a weigh-in, not a profile column.
         *
         * There is no `weight_kg` on `profiles` at all: current weight is the
         * newest row in `weight_logs`, so onboarding's answer becomes the first
         * reading — which also gives the weight chart a starting point for
         * free, and is what lets the database compute the calorie budget.
         */
        logWeight.mutateAsync({ kg: weightKg }),
      ])
      router.push('/activity')
    } catch (error) {
      // Awaited rather than fired and forgotten, because everything downstream
      // is computed from these two writes. Walking on after a failure ends at a
      // target screen with no budget on it and no way to know why.
      toast.show({
        title: error instanceof Error ? error.message : t('common:action.retry'),
        tone: 'error',
      })
    }
  }

  return (
    <OnboardingStep
      step={2}
      total={5}
      accent="water"
      title={t('about.title')}
      subtitle={t('about.subtitle')}
      primaryLabel={t('common:action.continue')}
      primaryDisabled={saving}
      onPrimary={save}
    >
      <View className="flex-row gap-3">
        <TextField
          containerClassName="flex-1"
          label={t('about.height')}
          keyboardType="number-pad"
          value={heightText}
          onChangeText={(height) => edit({ height })}
          // Blur is where the clamp becomes visible: "show me what you
          // understood". Continue re-reads the field either way, so a user who
          // taps it straight from the keyboard loses nothing.
          onBlur={() => edit({ height: String(heightCm) })}
          inputClassName="font-display text-[26px]"
          rightSlot={<Text variant="caption">{t('common:unit.cm')}</Text>}
        />
        <TextField
          containerClassName="flex-1"
          label={t('about.weight')}
          keyboardType="decimal-pad"
          value={weightText}
          onChangeText={(weight) => edit({ weight })}
          onBlur={() => edit({ weight: String(weightKg) })}
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
          onChange={(next) => edit({ sex: next as Sex })}
          accessibilityLabel={t('about.sex')}
        />
      </Card>

      <Card title={t('about.age')}>
        <Stepper
          value={age}
          onChange={(next) => edit({ age: next })}
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
          onChange={(next) => edit({ targetWeightKg: next })}
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
