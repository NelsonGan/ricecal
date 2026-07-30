import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { motion } from '@/theme/tokens'
import { cn } from './cn'
import { Tappable, type TappableProps } from './Tappable'

const TRACK_WIDTH = 76
const TRACK_HEIGHT = 42
const KNOB = 34
const PADDING = 4
const TRAVEL = TRACK_WIDTH - KNOB - PADDING * 2

export type SwitchProps = Omit<TappableProps, 'onPress' | 'children'> & {
  value: boolean
  onValueChange: (value: boolean) => void
  /** Read out by a screen reader; the switch itself has no visible text. */
  accessibilityLabel: string
  className?: string
}

/**
 * A controlled toggle.
 *
 * Controlled only — no internal state and no defaultValue. A switch that has
 * been optimistically flipped but whose write failed has to be able to flip
 * back, and it cannot do that if it owns the truth.
 *
 * The knob animates from a `useEffect` on `value` rather than from the press
 * handler, so it always shows what the caller actually committed. If a Supabase
 * write is rejected and the parent reverts, the knob follows.
 */
export function Switch({
  value,
  onValueChange,
  accessibilityLabel,
  disabled,
  className,
  ...rest
}: SwitchProps) {
  const offset = useSharedValue(value ? TRAVEL : 0)

  useEffect(() => {
    offset.value = withTiming(value ? TRAVEL : 0, {
      duration: motion.pressIn * 2,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    })
  }, [value, offset])

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }))

  return (
    <Tappable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      className={cn(disabled && 'opacity-50', className)}
      {...rest}
    >
      <View
        className={cn('justify-center rounded-full', value ? 'bg-pandan' : 'bg-disabled')}
        style={{ width: TRACK_WIDTH, height: TRACK_HEIGHT, padding: PADDING }}
      >
        <Animated.View
          className="rounded-full bg-surface"
          style={[{ width: KNOB, height: KNOB }, knobStyle]}
        />
      </View>
    </Tappable>
  )
}
