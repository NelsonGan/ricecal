import { View } from 'react-native'

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
  disabled = false,
  accessibilityLabel,
  decrementLabel = 'Decrease',
  incrementLabel = 'Increase',
  className,
}: StepperProps) {
  const atMin = value - step < min
  const atMax = value + step > max

  const colors = useThemeColors()

  // Re-round after arithmetic: 0.1 + 0.2 is famously not 0.3, and the value
  // shows up on screen.
  const shift = (delta: number) =>
    onChange(Number(Math.min(max, Math.max(min, value + delta)).toFixed(4)))

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
        <Text className="font-display text-[34px] leading-[41px] text-heading">
          {format(value)}
        </Text>
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
