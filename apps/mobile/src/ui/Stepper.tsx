import { useState } from 'react'
import { Platform, TextInput, View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import { useNumpadField } from './Numpad'
import { Text } from './Text'

export type StepperProps = {
  value: number
  onChange: (value: number) => void
  /** Amount added or removed per tap. Halves are normal here: 1½ plates. */
  step?: number
  min?: number
  max?: number
  /** Unit shown under the value: "plates", "kg", "ml". */
  unit?: string
  /** Override how the value reads. Defaults to a fraction-aware format. */
  format?: (value: number) => string
  /**
   * Lets the number itself be tapped and typed into.
   *
   * For a quantity the steps cannot express: 0.5 covers half a plate and 1.5
   * covers one and a half, but 0.3 of a tub of yoghurt takes six taps to reach
   * and 0.35 cannot be reached at all. The steps stay the fast path.
   */
  editable?: boolean
  /** Screen-reader name for the number when it can be typed into. */
  editLabel?: string
  disabled?: boolean
  accessibilityLabel?: string
  /** Screen-reader names for the two buttons. Pass translated copy. */
  decrementLabel?: string
  incrementLabel?: string
  className?: string
}

const VULGAR: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' }

/** The same correction `Text` applies, for the one input that carries display type. */
const androidTightening = Platform.OS === 'android' ? { includeFontPadding: false } : null

/**
 * Renders 1.5 as "1½".
 *
 * The design system leads with everyday serving units — half a plate, one and a
 * half bowls — and "1.5 plates" reads like a spreadsheet. Falls back to a plain
 * number for anything that is not a clean quarter.
 */
function formatPortion(value: number) {
  const whole = Math.floor(value)
  const glyph = VULGAR[(value - whole).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')]
  if (!glyph) return String(Number(value.toFixed(2)))
  return whole === 0 ? glyph : `${whole}${glyph}`
}

/**
 * A minus / value / plus control for portions, weights and goals.
 *
 * Clamping lives here rather than in each caller, and the buttons disable at
 * the bounds so the control cannot ask for a value it will refuse to produce.
 */
export function Stepper({
  value,
  onChange,
  step = 0.5,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  unit,
  format = formatPortion,
  editable = false,
  editLabel,
  disabled = false,
  accessibilityLabel,
  decrementLabel = 'Decrease',
  incrementLabel = 'Increase',
  className,
}: StepperProps) {
  const atMin = value - step < min
  const atMax = value + step > max

  const colors = useThemeColors()

  /**
   * What is in the field while it is being typed into, and `null` when it is
   * not.
   *
   * The keystrokes cannot go straight to `onChange`: "1." is not a number and
   * "0" may be below `min`, so clamping each one would fight the typing —
   * deleting the last digit of "12" would snap the field back to the minimum
   * before the next one could be typed. It is parsed once, on the way out.
   */
  const [typed, setTyped] = useState<string | null>(null)

  const clamp = (next: number) => Number(Math.min(max, Math.max(min, next)).toFixed(4))

  // Re-round after arithmetic: 0.1 + 0.2 is famously not 0.3, and the value
  // shows up on screen.
  const shift = (delta: number) => onChange(clamp(value + delta))

  /**
   * Focus empties the field, and the old value becomes its placeholder.
   *
   * Not "seed it with the current number and select it all", which is the obvious
   * thing and is not deterministic: the text has to change on focus either way —
   * "1½" is not editable digits — and where the caret and the selection end up
   * after a programmatic change on the same frame as the focus is the platform's
   * business. Append on one, replace on the other, and no way to tell from here.
   *
   * Empty means whatever is typed IS the value, on every platform. Typing over
   * the whole number is also what someone reaching for this wants: the ± buttons
   * are how you nudge, and this is how you say 0.35.
   */
  const startEditing = () => setTyped('')

  const commit = () => {
    // A comma is the decimal separator on a good part of the world's keyboards,
    // and `Number(',5')` is NaN.
    const raw = (typed ?? '').replace(',', '.').trim()
    const parsed = Number(raw)
    setTyped(null)
    // An empty or unparseable field keeps the value it had rather than falling to
    // `min` — `Number('')` is 0, so the empty case has to be caught by hand.
    if (!raw || !Number.isFinite(parsed)) return
    onChange(clamp(parsed))
  }

  /**
   * Typed on the app's own pad rather than the system one.
   *
   * The unit is what the pad calls it, because the caption saying "plates" is
   * two lines under the field and the pad covers the bottom half of the screen:
   * a header reading "Servings" is the only thing left on screen that says what
   * the digits are for.
   */
  const numpad = useNumpadField({
    enabled: editable && !disabled,
    value: typed ?? '',
    onChangeText: setTyped,
    label: editLabel ?? unit,
    onFocus: startEditing,
    onBlur: commit,
    returnKeyType: 'done',
  })

  return (
    <View
      className={cn('flex-row items-center justify-between gap-md', className)}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: `${format(value)}${unit ? ` ${unit}` : ''}` }}
    >
      <IconButton
        variant="subtle"
        accessibilityLabel={decrementLabel}
        disabled={disabled || atMin}
        onPress={() => shift(-step)}
      >
        {/* Tinted for the same reason as the plus below: the illustration
            carries its own palette, which on a neutral button reads as a
            stray colour rather than a control. */}
        <Icon set="ui" name="minus" size={26} tintColor={colors.muted} />
      </IconButton>

      <View className="items-center gap-0.5">
        {/* A field only where a caller asked for one. Every other stepper in the
            app keeps the `Text` it had: a `TextInput` with `editable={false}` is
            not a drop-in for a label — it announces as a text field, it carries
            the platform's own input metrics, and on Android it draws an underline
            of its own.

            Where it IS a field it is a field in both states rather than a `Text`
            that swaps for one on tap. The swap put a different view in the middle
            of the row depending on focus, and the two do not measure the same, so
            the whole control shifted by a couple of points as the keyboard came
            up. The dashed rule is what says it can be typed into, and it turns
            solid pandan while it is; a hint line would say it louder and cost a
            row of height in a control that is already three deep. */}
        {editable ? (
          <TextInput
            value={typed ?? format(value)}
            editable={!disabled}
            onChangeText={setTyped}
            onSubmitEditing={commit}
            // Kept, and it does nothing while the app's own pad is up. It is
            // what this field falls back to if a platform ever declines to
            // suppress the keyboard: a number pad in the wrong place beats a
            // QWERTY one.
            //
            // `returnKeyType` is the same fallback and cannot be set here, so
            // it goes to the hook instead — asked for on the element it reaches
            // UIKit even with the keyboard suppressed, and iOS 26 answers a
            // number pad's missing return key with the floating "Done" pill.
            keyboardType="decimal-pad"
            // What the field held before it was emptied, so the number does not
            // vanish out from under the person about to retype it.
            placeholder={typed === '' ? format(value) : undefined}
            placeholderTextColor={colors.faint}
            // Android draws a Material underline under a bare TextInput, which
            // would sit under the rule this control draws for itself.
            underlineColorAndroid="transparent"
            /* WIDE ENOUGH FOR THE WIDEST NUMBER THIS CONTROL SHOWS, because a
               `TextInput` does not grow to fit its own text — it lays out at
               whatever width it is given and crops what does not fit, silently
               and on the trailing edge.

               At 92pt a weight in pounds lost its last digit: 200.0 kg reads as
               440.9 lb and drew "440.", so the one number the sheet exists to
               show was the one thing on it the user could not read. Baloo's
               digits are proportional, which is why it looked intermittent —
               441.0 fitted where 440.9 did not, and the kilogram side never
               showed it at all. 128pt clears five of the widest glyphs plus the
               padding, with the decimal point to spare. */
            className={cn(
              'min-w-[128px] border-b-2 px-2 text-center font-display text-[34px] text-heading',
              typed === null ? 'border-line border-dashed' : 'border-pandan',
            )}
            // Android reserves room for ascenders this glyph does not use, which
            // pushes a big Baloo numeral off centre — the same correction `Text`
            // makes for every display-sized number in the app.
            style={androidTightening}
            cursorColor={colors.pandan}
            selectionColor={colors.pandan}
            accessibilityLabel={editLabel}
            {...numpad}
          />
        ) : (
          <Text className="font-display text-[34px] leading-[41px] text-heading">
            {format(value)}
          </Text>
        )}
        {unit ? <Text variant="caption">{unit}</Text> : null}
      </View>

      <IconButton
        variant="primary"
        accessibilityLabel={incrementLabel}
        disabled={disabled || atMax}
        onPress={() => shift(step)}
      >
        {/* Tinted to the role, not to white: the pandan fill brightens in dark
            mode and takes near-black content, so a hardcoded white plus
            disappears into it. */}
        <Icon set="ui" name="plus" size={26} tintColor={colors.onPandan} />
      </IconButton>
    </View>
  )
}
