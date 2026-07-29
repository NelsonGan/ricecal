import { useCallback } from 'react'
import { type LayoutChangeEvent, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated'

import { cn } from './cn'
import { Text } from './Text'

const TRACK_HEIGHT = 16
const THUMB = 34

export type SliderProps = {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  /** Snap increment. 0 slides continuously. */
  step?: number
  /** Shown above the track with the current value. Omit when the section already names it. */
  label?: string
  /** For a slider whose label is elsewhere on screen. Falls back to `label`. */
  accessibilityLabel?: string
  /** Formats both the readout and the end captions. */
  format?: (value: number) => string
  disabled?: boolean
  className?: string
}

/**
 * A slider for a bounded target: daily goal, macro split, reminder hour.
 *
 * Built on gesture-handler and Reanimated rather than a JS `PanResponder` so
 * the thumb tracks the finger on the UI thread. `onChange` is called from JS
 * via `runOnJS`, so a parent re-render never stutters the drag.
 *
 * Width comes from `onLayout` instead of `Dimensions`, which keeps it correct
 * inside a card, in a split view, and after a rotation.
 */
export function Slider({
  value,
  onChange,
  min,
  max,
  step = 0,
  label,
  accessibilityLabel,
  format = (n) => n.toLocaleString(),
  disabled = false,
  className,
}: SliderProps) {
  const width = useSharedValue(0)
  const dragging = useSharedValue(false)
  const dragValue = useSharedValue(value)

  // While dragging, the thumb follows the finger; otherwise it follows the
  // prop. Reading the prop directly during a drag would fight the gesture on
  // every parent render.
  const current = useDerivedValue(() => (dragging.value ? dragValue.value : value))

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      width.value = event.nativeEvent.layout.width
    },
    [width],
  )

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(0)
    .onBegin((event) => {
      dragging.value = true
      dragValue.value = positionToValue(event.x, width.value, min, max, step)
      runOnJS(onChange)(dragValue.value)
    })
    .onUpdate((event) => {
      dragValue.value = positionToValue(event.x, width.value, min, max, step)
      runOnJS(onChange)(dragValue.value)
    })
    .onFinalize(() => {
      dragging.value = false
    })

  const fillStyle = useAnimatedStyle(() => ({
    width: `${ratio(current.value, min, max) * 100}%`,
  }))

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: ratio(current.value, min, max) * width.value - THUMB / 2 }],
  }))

  return (
    <View className={cn('gap-3', disabled && 'opacity-50', className)}>
      {label ? (
        <View className="flex-row items-baseline justify-between">
          <Text variant="label">{label}</Text>
          <Text className="font-display text-[24px] leading-[28px] text-heading">
            {format(value)}
          </Text>
        </View>
      ) : null}

      <GestureDetector gesture={gesture}>
        {/* Padding widens the touch strip to 44pt without moving the 16pt
            track, so the thin visual does not mean a thin target. */}
        <View
          className="justify-center py-[14px]"
          onLayout={onLayout}
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityValue={{ min, max, now: value, text: format(value) }}
        >
          <View className="rounded-full bg-track" style={{ height: TRACK_HEIGHT }}>
            <Animated.View className="h-full rounded-full bg-pandan" style={fillStyle} />
          </View>
          <Animated.View
            className="absolute rounded-sm border-[3px] border-pandan bg-surface"
            style={[{ width: THUMB, height: THUMB }, thumbStyle]}
          />
        </View>
      </GestureDetector>

      <View className="flex-row justify-between">
        <Text variant="caption" className="text-faint">
          {format(min)}
        </Text>
        <Text variant="caption" className="text-faint">
          {format(max)}
        </Text>
      </View>
    </View>
  )
}

function ratio(value: number, min: number, max: number) {
  'worklet'
  if (max === min) return 0
  return Math.min(1, Math.max(0, (value - min) / (max - min)))
}

function positionToValue(x: number, width: number, min: number, max: number, step: number) {
  'worklet'
  if (width <= 0) return min
  const raw = min + (Math.min(width, Math.max(0, x)) / width) * (max - min)
  if (step <= 0) return raw
  return Math.min(max, Math.max(min, Math.round(raw / step) * step))
}
