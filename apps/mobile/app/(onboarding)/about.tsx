import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Sex } from '@/data'
import { OnboardingStep, useOnboardingDraft } from '@/features/onboarding'
import { AGE_RANGE, HEIGHT_RANGE, targetWeightRange, WEIGHT_RANGE } from '@/lib/nutrition'
import { ReplayMask } from '@/lib/replay-mask'
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
import { FormCard, FormRow, SegmentedControl, Slider, Text, TextField } from '@/ui'

/** Room for a four-digit answer and its unit, and no more. */
const FIELD_WIDTH = 'w-[124px]'

/**
 * About you, and nothing on this screen starts answered.
 *
 * It used to open on a plausible body, every field of which is a real answer as
 * far as `compute_targets()` is concerned, so Continue was live on arrival and a
 * user who tapped through got a budget worked out for somebody else. The four
 * questions are empty and the CTA is dead until all four are answered.
 *
 * The target-weight slider has no honest place for its thumb until the weight
 * above it exists, which is why it is held until then. After that it starts on
 * that weight and needs no drag: keeping the weight you have is a real answer.
 *
 * Every bound below is metric and the fields are not: `setup` asked which system
 * to use one screen ago, so both are converted before anything is clamped or
 * stored. The draft, `profiles` and `weight_logs` are centimetres and kilograms
 * everywhere, and the display unit belongs to the person reading.
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
      ? clampMaybe(fromFeetInches(Number(fields.feet), Number(fields.inches)), HEIGHT_RANGE)
      : undefined
    : read(fields.height, HEIGHT_RANGE)

  const typedWeight = read(fields.weight, bounds(WEIGHT_RANGE, weightUnit))
  const weightKg = typedWeight == null ? undefined : toKg(typedWeight, weightUnit)
  const age = read(fields.age, AGE_RANGE)
  const sex = draft.sex
  const targetWeightKg = draft.targetWeightKg

  /**
   * What the target slider can reach, which moves with the weight above it: the
   * track always gets as far as the body it is for, so somebody at 260 kg can
   * still put their target where they already are.
   */
  const targetRange = targetWeightRange(weightKg ?? 0)

  /**
   * Whether the target is somebody's choice rather than this screen's default.
   *
   * A drag on this visit is a choice. So is a stored target that differs from
   * the stored weight, since only a drag can produce one. A stored target EQUAL
   * to the stored weight is the default Continue wrote last time (or a drag that
   * landed on "keep my weight", which means the same), and it has to keep
   * following the weight: kept as a number, correcting 65 kg to 80 on the way
   * back here would quietly turn "keep my weight" into a plan to lose 15 kg.
   */
  const [dragged, setDragged] = useState(false)
  const chosen = dragged || (targetWeightKg != null && targetWeightKg !== draft.weightKg)

  /**
   * The target the screen will record: the one chosen, or the weight typed
   * above it, which is "keep my weight".
   *
   * Continue used to wait for a drag as well. The thumb already sits on the
   * current weight, so somebody happy there had to drag it away and back, and
   * people stalled on a screen that looked finished. The plan step names the
   * goal this produces and has a way back here, so the default is never silent.
   */
  const followed = weightKg != null ? clamp(weightKg, targetRange) : undefined
  const target = chosen ? targetWeightKg : followed

  /**
   * What the readout and thumb show. The default only once the typed weight is
   * inside its range: `read` clamps on every keystroke, so the "6" on the way to
   * "65" would otherwise flash the 20 kg floor. Continue still records the
   * clamped value, which is also what the field settles to on blur.
   */
  const typedInRange = typedWeight != null && typedWeight === Number(fields.weight)
  const shownTarget = chosen ? targetWeightKg : typedInRange ? followed : undefined

  /** Where the thumb sits, which needs a number even before there is a weight. */
  const targetPreview = shownTarget ?? targetRange.min

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
      const cm = clampMaybe(
        fromFeetInches(Number(current.feet), Number(current.inches)),
        HEIGHT_RANGE,
      )
      if (cm == null) return current
      const { feet, inches } = toFeetInches(cm)
      return { ...current, feet: String(feet), inches: String(inches) }
    })

  const ready = heightCm != null && weightKg != null && age != null && sex != null

  const save = () => {
    if (!ready || target == null) return
    patch({ heightCm, weightKg, age, sex, targetWeightKg: target })
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
      art={{ set: 'body', name: 'weighing-scale' }}
      title={t('about.title')}
      subtitle={t('about.subtitle')}
      /**
       * `dismissTo`, not `back()`, and this screen is the reason the whole flow
       * uses it. `app/index.tsx` and `finish` used to REDIRECT an incomplete
       * flow straight here (they now start it at `ONBOARDING_STEPS[0]`), so
       * `about` was regularly the only screen on the
       * stack, and `back()` with nothing to pop is answered by whichever
       * navigator up the chain is listening, which means changing tab.
       * `dismissTo` pops to `setup` when it is there and replaces this screen
       * with it when it is not.
       */
      onBack={() => router.dismissTo('/(onboarding)/setup')}
      primaryLabel={t('common:action.continue')}
      primaryDisabled={!ready || target == null}
      onPrimary={save}
    >
      {/* One card of rows, a label on the left and a small box on the right.
          Each answer used to be its own full-width box with a heading over it,
          in 26pt display type, which made four short numbers the heaviest
          screen in the flow. The fields keep their labels for the number
          pad's header and for a screen reader; the row draws them once. */}
      <FormCard>
        <FormRow label={t('about.height')}>
          {inFeet ? (
            <>
              <TextField
                size="sm"
                hideLabel
                containerClassName="w-[76px]"
                label={t('about.height')}
                keyboardType="number-pad"
                placeholder={t('about.feetPlaceholder')}
                value={fields.feet}
                onChangeText={(feet) => setFields((current) => ({ ...current, feet }))}
                onBlur={settleHeight}
                rightSlot={<Text variant="caption">{t('about.feet')}</Text>}
              />
              <TextField
                size="sm"
                hideLabel
                containerClassName="w-[76px]"
                label={t('about.inchesLabel')}
                keyboardType="number-pad"
                placeholder={t('about.inchesPlaceholder')}
                value={fields.inches}
                onChangeText={(inches) => setFields((current) => ({ ...current, inches }))}
                onBlur={settleHeight}
                rightSlot={<Text variant="caption">{t('about.inches')}</Text>}
              />
            </>
          ) : (
            <TextField
              size="sm"
              hideLabel
              containerClassName={FIELD_WIDTH}
              label={t('about.height')}
              keyboardType="number-pad"
              placeholder={t('about.heightPlaceholder')}
              value={fields.height}
              onChangeText={(height) => setFields((current) => ({ ...current, height }))}
              onBlur={settle('height', HEIGHT_RANGE)}
              rightSlot={<Text variant="caption">{t('common:unit.cm')}</Text>}
            />
          )}
        </FormRow>

        <FormRow label={t('about.weight')}>
          {/* The weight is kept out of replays; the mask takes the field's place. */}
          <ReplayMask>
            <TextField
              size="sm"
              hideLabel
              containerClassName={FIELD_WIDTH}
              label={t('about.weight')}
              replayMasked
              keyboardType="decimal-pad"
              placeholder={inFeet ? t('about.weightPlaceholderLb') : t('about.weightPlaceholder')}
              value={fields.weight}
              onChangeText={(weight) => setFields((current) => ({ ...current, weight }))}
              onBlur={settle('weight', bounds(WEIGHT_RANGE, weightUnit))}
              rightSlot={<Text variant="caption">{t(UNIT_KEY[weightUnit])}</Text>}
            />
          </ReplayMask>
        </FormRow>

        {/* A field rather than a stepper. A stepper cannot be empty: it either
            shows a number nobody chose or a dash with arrows either side of
            nothing, and the first is what this screen is trying to stop. */}
        <FormRow label={t('about.age')}>
          <TextField
            size="sm"
            hideLabel
            containerClassName={FIELD_WIDTH}
            label={t('about.age')}
            keyboardType="number-pad"
            placeholder={t('about.agePlaceholder')}
            value={fields.age}
            onChangeText={(next) => setFields((current) => ({ ...current, age: next }))}
            onBlur={settle('age', AGE_RANGE)}
            rightSlot={<Text variant="caption">{t('about.years')}</Text>}
          />
        </FormRow>

        {/* Asked because the budget cannot be computed without it: Mifflin-St
            Jeor branches on sex, and `compute_targets()` returns nothing at all
            while the column is null. */}
        <FormRow label={t('about.sex')}>
          <SegmentedControl
            size="sm"
            className="w-[176px]"
            options={[
              { value: 'female', label: t('about.female') },
              { value: 'male', label: t('about.male') },
            ]}
            value={sex}
            onChange={(next) => patch({ sex: next as Sex })}
            accessibilityLabel={t('about.sex')}
          />
        </FormRow>
      </FormCard>

      <FormCard>
        <FormRow
          label={t('about.targetWeight')}
          value={
            <ReplayMask>
              <Text variant="bodyStrong">
                {shownTarget != null
                  ? `${fromKg(shownTarget, weightUnit).toFixed(1)} ${t(UNIT_KEY[weightUnit])}`
                  : t('about.targetWeightUnset')}
              </Text>
            </ReplayMask>
          }
          below={
            <>
              <ReplayMask>
                <Slider
                  value={fromKg(targetPreview, weightUnit)}
                  // `Slider` reports every frame of a drag, which is why this
                  // writes to the draft and not to the network.
                  onChange={(next) => {
                    setDragged(true)
                    patch({ targetWeightKg: toKg(next, weightUnit) })
                  }}
                  min={fromKg(targetRange.min, weightUnit)}
                  max={fromKg(targetRange.max, weightUnit)}
                  // Half a kilogram is a scale's precision; half a pound is finer
                  // than anybody aims a slider, so imperial steps a whole one.
                  step={weightUnit === 'lb' ? 1 : 0.5}
                  // Nothing to measure a target against until the weight exists.
                  disabled={weightKg == null}
                  accessibilityLabel={t('about.targetWeight')}
                  format={(value) => `${value.toFixed(1)} ${t(UNIT_KEY[weightUnit])}`}
                />
              </ReplayMask>
              {/* The slider is locked until there is a weight, so the card says
                  so; then, until it is dragged, that it can be. */}
              {weightKg == null ? (
                <Text variant="meta">{t('about.targetWeightLocked')}</Text>
              ) : !chosen ? (
                <Text variant="meta">{t('about.targetWeightHint')}</Text>
              ) : null}
            </>
          }
        />
      </FormCard>
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
 * The limits are on the real quantity, not on the number in the box: 20 kg and
 * 44 lb are the same floor, and clamping a pounds field against 20 would refuse
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
