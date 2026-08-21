import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Sex } from '@/data'
import { OnboardingStep, useOnboardingDraft } from '@/features/onboarding'
import {
  fromFeetInches,
  fromKg,
  heightUnitFor,
  toFeetInches,
  toKg,
  UNIT_KEY,
  unitFor,
  type WeightUnit,
} from '@/lib/units'
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
 *
 * EVERY BOUND BELOW IS METRIC, and the fields are not. `setup` asked which
 * system to use one screen ago, so a height may be typed as feet and inches and
 * a weight as pounds. Both are converted before anything is clamped or stored:
 * the draft, `profiles` and `weight_logs` are centimetres and kilograms in every
 * language and every unit system, and the display unit is a property of the
 * person reading rather than of the number.
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
  const units = draft.units ?? 'metric'
  const weightUnit = unitFor(units)
  const inFeet = heightUnitFor(units) === 'ftin'

  const [fields, setFields] = useState(() => {
    const height = draft.heightCm != null ? toFeetInches(draft.heightCm) : null
    return {
      height: draft.heightCm != null ? String(draft.heightCm) : '',
      feet: height ? String(height.feet) : '',
      inches: height ? String(height.inches) : '',
      weight: draft.weightKg != null ? typed(fromKg(draft.weightKg, weightUnit)) : '',
      age: draft.age != null ? String(draft.age) : '',
    }
  })

  /**
   * Two fields make one answer, and it is only an answer when both are filled.
   *
   * A lone "5" in the feet box is 152 cm, which is a real height and not what
   * anybody halfway through typing means. Inches are allowed to be zero, so the
   * test is on the text rather than on the number.
   */
  const heightCm = inFeet
    ? fields.feet.trim() && fields.inches.trim()
      ? clampMaybe(fromFeetInches(Number(fields.feet), Number(fields.inches)), HEIGHT)
      : undefined
    : read(fields.height, HEIGHT)

  const typedWeight = read(fields.weight, bounds(WEIGHT, weightUnit))
  const weightKg = typedWeight == null ? undefined : toKg(typedWeight, weightUnit)
  const age = read(fields.age, AGE)
  const sex = draft.sex
  const targetWeightKg = draft.targetWeightKg

  /** What the slider shows before it has been dragged. Never written anywhere. */
  const targetPreview = targetWeightKg ?? (weightKg != null ? clamp(weightKg, TARGET) : TARGET.min)

  /** Blur is where the clamp becomes visible: "show me what you understood". */
  const settle = (key: keyof typeof fields, within: { min: number; max: number }) => () =>
    setFields((current) => {
      const value = read(current[key], within)
      return value == null ? current : { ...current, [key]: typed(value) }
    })

  /**
   * The imperial height settles as a PAIR, because clamping either box on its
   * own is nonsense: 7 feet 11 inches has to come back as 7 feet 2, not as
   * 7 feet and a separately clamped 11.
   */
  const settleHeight = () =>
    setFields((current) => {
      if (!current.feet.trim() || !current.inches.trim()) return current
      const cm = clampMaybe(fromFeetInches(Number(current.feet), Number(current.inches)), HEIGHT)
      if (cm == null) return current
      const { feet, inches } = toFeetInches(cm)
      return { ...current, feet: String(feet), inches: String(inches) }
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
       * `dismissTo` pops to `setup` when it is there and replaces this screen
       * with it when it is not.
       */
      onBack={() => router.dismissTo('/(onboarding)/setup')}
      primaryLabel={t('common:action.continue')}
      primaryDisabled={!ready || targetWeightKg == null}
      onPrimary={save}
    >
      {/*
        Imperial takes two rows, metric one.

        Feet and inches are two boxes, because nobody knows their height in
        inches — and three boxes across one row leaves each about a quarter of a
        phone, which is not enough for a two-character unit beside a digit. The
        pair gets its own row and the weight gets the next.
      */}
      {inFeet ? (
        <View className="flex-row gap-3">
          <TextField
            containerClassName="flex-1"
            label={t('about.height')}
            keyboardType="number-pad"
            placeholder={t('about.feetPlaceholder')}
            value={fields.feet}
            onChangeText={(feet) => setFields((current) => ({ ...current, feet }))}
            onBlur={settleHeight}
            inputClassName="font-display text-[26px]"
            rightSlot={<Text variant="caption">{t('about.feet')}</Text>}
          />
          <TextField
            containerClassName="flex-1"
            label={t('about.inchesLabel')}
            keyboardType="number-pad"
            placeholder={t('about.inchesPlaceholder')}
            value={fields.inches}
            onChangeText={(inches) => setFields((current) => ({ ...current, inches }))}
            onBlur={settleHeight}
            inputClassName="font-display text-[26px]"
            rightSlot={<Text variant="caption">{t('about.inches')}</Text>}
          />
        </View>
      ) : null}

      <View className="flex-row gap-3">
        {inFeet ? null : (
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
        )}
        <TextField
          containerClassName="flex-1"
          label={t('about.weight')}
          keyboardType="decimal-pad"
          placeholder={inFeet ? t('about.weightPlaceholderLb') : t('about.weightPlaceholder')}
          value={fields.weight}
          onChangeText={(weight) => setFields((current) => ({ ...current, weight }))}
          onBlur={settle('weight', bounds(WEIGHT, weightUnit))}
          inputClassName="font-display text-[26px]"
          rightSlot={<Text variant="caption">{t(UNIT_KEY[weightUnit])}</Text>}
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
              ? `${fromKg(targetWeightKg, weightUnit).toFixed(1)} ${t(UNIT_KEY[weightUnit])}`
              : t('about.targetWeightUnset')}
          </Text>
        }
      >
        <Slider
          value={fromKg(targetPreview, weightUnit)}
          // `Slider` reports every frame of a drag, which is why this writes to
          // the draft and not to the network: the same handler against a profile
          // update was a request, and a budget recompute, per frame.
          onChange={(next) => patch({ targetWeightKg: toKg(next, weightUnit) })}
          min={fromKg(TARGET.min, weightUnit)}
          max={fromKg(TARGET.max, weightUnit)}
          // Half a kilogram is a scale's precision; half a pound is finer than
          // anybody aims a slider, so imperial steps a whole one.
          step={weightUnit === 'lb' ? 1 : 0.5}
          // Nothing to measure a target against until the weight above exists,
          // and a thumb sitting at 40 kg is a suggestion rather than a blank.
          disabled={weightKg == null}
          // The card already says TARGET WEIGHT; a second label under it would
          // be the same words twice.
          accessibilityLabel={t('about.targetWeight')}
          format={(value) => `${value.toFixed(1)} ${t(UNIT_KEY[weightUnit])}`}
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
 * A number as somebody would have typed it.
 *
 * At most one decimal, and none at all when there is nothing after the point.
 * A stored 80 kg has to come back into the field as "80": seeded as "80.0" it
 * reads as a value the app invented, and appending to it produces "80.0.5".
 * A converted weight needs the decimal, so it cannot simply be rounded.
 */
function typed(value: number): string {
  return String(Number(value.toFixed(1)))
}

/**
 * A metric bound, expressed in whichever unit the field is typed in.
 *
 * The limits are on the real quantity, not on the number in the box: 30 kg and
 * 66 lb are the same floor, and clamping a pounds field against 30 would refuse
 * every weight anybody using pounds would ever type.
 */
function bounds(within: { min: number; max: number }, unit: WeightUnit) {
  return { min: fromKg(within.min, unit), max: fromKg(within.max, unit) }
}

/** `clamp`, for a value that is already a number rather than typed text. */
function clampMaybe(value: number, within: { min: number; max: number }): number | undefined {
  return Number.isFinite(value) && value > 0 ? clamp(value, within) : undefined
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
