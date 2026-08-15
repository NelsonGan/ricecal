import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Sex } from '@/data'
import { OnboardingStep, useOnboardingDraft } from '@/features/onboarding'
import { Card, SegmentedControl, Slider, Text, TextField } from '@/ui'

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
const AGE = { min: 13, max: 100 }
const TARGET = { min: 40, max: 120 }

/**
 * 02 ABOUT YOU
 *
 * NOTHING ON THIS SCREEN STARTS ANSWERED.
 *
 * It used to open on a plausible body — 164 cm, 65 kg, 29, female, target
 * weight wherever the current one landed — and every one of those is a real
 * answer as far as `compute_targets()` is concerned. So Continue was live on
 * arrival, and a user who tapped through it got a budget worked out for
 * somebody else with nothing on screen to say so. The five controls are empty,
 * the CTA is dead until all five are filled, and the only way past is to answer.
 *
 * The cost is that the target-weight slider has no honest place to put its thumb
 * until the weight above it exists, which is why it is held until then: the
 * question it asks is "how far from where you are", and it cannot be asked of
 * somebody whose weight the screen does not know.
 */
export default function AboutStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const { draft, patch } = useOnboardingDraft()

  /**
   * The three numeric fields hold TEXT, not numbers.
   *
   * Clamping on every keystroke would turn a half-typed "1" into "120" under
   * the user's cursor, and a number cannot represent "empty" without also
   * meaning zero. Seeded from the draft so walking back to this screen shows
   * what was answered rather than clearing it.
   */
  const [fields, setFields] = useState(() => ({
    height: draft.heightCm != null ? String(draft.heightCm) : '',
    weight: draft.weightKg != null ? String(draft.weightKg) : '',
    age: draft.age != null ? String(draft.age) : '',
  }))

  const heightCm = read(fields.height, HEIGHT)
  const weightKg = read(fields.weight, WEIGHT)
  const age = read(fields.age, AGE)
  const sex = draft.sex
  const targetWeightKg = draft.targetWeightKg

  /** What the slider shows before it has been dragged. Never written anywhere. */
  const targetPreview = targetWeightKg ?? (weightKg != null ? clamp(weightKg, TARGET) : TARGET.min)

  /** Blur is where the clamp becomes visible: "show me what you understood". */
  const settle = (key: keyof typeof fields, bounds: { min: number; max: number }) => () =>
    setFields((current) => {
      const value = read(current[key], bounds)
      return value == null ? current : { ...current, [key]: String(value) }
    })

  const ready = heightCm != null && weightKg != null && age != null && sex != null

  const save = () => {
    if (!ready || targetWeightKg == null) return
    patch({ heightCm, weightKg, age, sex, targetWeightKg })
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
      name="about"
      accent="water"
      title={t('about.title')}
      /**
       * `dismissTo`, not `back()`, and this screen is the reason the whole flow
       * uses it. `app/index.tsx` REDIRECTS a signed-in account with no
       * `onboarded_at` and no draft straight here, and `finish` redirects here
       * for an incomplete one — so `about` is regularly the only screen on the
       * stack, and `back()` with nothing to pop is answered by whichever
       * navigator up the chain is listening, which means changing tab.
       * `dismissTo` pops to welcome when it is there and replaces this screen
       * with it when it is not.
       */
      onBack={() => router.dismissTo('/(onboarding)/welcome')}
      primaryLabel={t('common:action.continue')}
      primaryDisabled={!ready || targetWeightKg == null}
      onPrimary={save}
    >
      <View className="flex-row gap-3">
        <TextField
          containerClassName="flex-1"
          label={t('about.height')}
          keyboardType="number-pad"
          placeholder={t('about.heightPlaceholder')}
          value={fields.height}
          onChangeText={(height) => setFields((current) => ({ ...current, height }))}
          onBlur={settle('height', HEIGHT)}
          inputClassName="font-display text-[26px]"
          rightSlot={<Text variant="caption">{t('common:unit.cm')}</Text>}
        />
        <TextField
          containerClassName="flex-1"
          label={t('about.weight')}
          keyboardType="decimal-pad"
          placeholder={t('about.weightPlaceholder')}
          value={fields.weight}
          onChangeText={(weight) => setFields((current) => ({ ...current, weight }))}
          onBlur={settle('weight', WEIGHT)}
          inputClassName="font-display text-[26px]"
          rightSlot={<Text variant="caption">{t('common:unit.kg')}</Text>}
        />
      </View>

      {/* A field rather than the stepper it replaced. A stepper cannot be empty:
          it either shows a number nobody chose or a dash with arrows either
          side of nothing, and the first is exactly what this screen is trying
          to stop doing. */}
      <TextField
        label={t('about.age')}
        keyboardType="number-pad"
        placeholder={t('about.agePlaceholder')}
        value={fields.age}
        onChangeText={(next) => setFields((current) => ({ ...current, age: next }))}
        onBlur={settle('age', AGE)}
        inputClassName="font-display text-[26px]"
        rightSlot={<Text variant="caption">{t('about.years')}</Text>}
      />

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

      <Card
        title={t('about.targetWeight')}
        action={
          <Text className="font-display text-[24px] leading-[29px] text-heading">
            {targetWeightKg != null
              ? `${targetWeightKg.toFixed(1)} ${t('common:unit.kg')}`
              : t('about.targetWeightUnset')}
          </Text>
        }
      >
        <Slider
          value={targetPreview}
          // `Slider` reports every frame of a drag, which is why this writes to
          // the draft and not to the network: the same handler against a profile
          // update was a request, and a budget recompute, per frame.
          onChange={(next) => patch({ targetWeightKg: next })}
          min={TARGET.min}
          max={TARGET.max}
          step={0.5}
          // Nothing to measure a target against until the weight above exists,
          // and a thumb sitting at 40 kg is a suggestion rather than a blank.
          disabled={weightKg == null}
          // The card already says TARGET WEIGHT; a second label under it would
          // be the same words twice.
          accessibilityLabel={t('about.targetWeight')}
          format={(value) => `${value.toFixed(1)} ${t('common:unit.kg')}`}
        />

        {targetWeightKg == null ? (
          <Text variant="meta">
            {weightKg == null ? t('about.targetWeightLocked') : t('about.targetWeightHint')}
          </Text>
        ) : null}
      </Card>
    </OnboardingStep>
  )
}

/**
 * What a field MEANS, or nothing at all.
 *
 * Empty, blank or unparseable all come back undefined rather than 0 — which is
 * the whole difference between "not answered yet" and "answered zero", and the
 * thing the Continue gate reads.
 */
function read(text: string, bounds: { min: number; max: number }): number | undefined {
  if (!text.trim()) return undefined
  const value = Number(text)
  if (!Number.isFinite(value) || value <= 0) return undefined
  return clamp(value, bounds)
}

function clamp(value: number, bounds: { min: number; max: number }) {
  return Math.min(bounds.max, Math.max(bounds.min, value))
}
