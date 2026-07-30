import { useState } from 'react'
import { TextInput, View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import { Text } from './Text'

export type StepperProps = {
  value: number
  onChange: (value: number) => void
  /** Amount added or removed per tap. Halves are normal here: 1½ plates. */
  step?: number
  min?: number
  max?: number
  /** Unit shown under the value: "plates", "kg", "glasses". */
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
 * A minus / value / plus control for portions, weights and glasses.
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

  // Plain digits, not "1½": the glyph is for reading, and it is not a number
  // anybody can edit.
  const startEditing = () => setTyped(String(Number(value.toFixed(2))))

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
        {/* One `TextInput` in both states rather than a `Text` that swaps for a
            field on tap. The swap put a different view in the middle of the row
            depending on whether it was focused, and the two do not measure the
            same — the whole control shifted by a couple of points as the keyboard
            came up. This way the number is the field, and focus is the only thing
            that changes.
            The dashed rule is what says it can be typed into; it turns solid
            pandan while it is. A hint line would say it louder and cost a row of
            height in a control that is already three deep. */}
        <TextInput
          value={typed ?? format(value)}
          editable={editable && !disabled}
          onFocus={startEditing}
          onChangeText={setTyped}
          // Committed on blur as well as on submit: the decimal pad has no return
          // key on iOS, so tapping away is the ordinary way out of it.
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="decimal-pad"
          returnKeyType="done"
          selectTextOnFocus
          className={cn(
            'min-w-[92px] px-2 text-center font-display text-[34px] text-heading',
            editable && 'border-b-2',
            typed === null ? 'border-line border-dashed' : 'border-pandan',
          )}
          cursorColor={colors.pandan}
          selectionColor={colors.pandan}
          accessibilityLabel={editable ? editLabel : undefined}
        />
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
