import { useCallback, useMemo, useRef, useState } from 'react'
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
  /**
   * Labelled points along the track, in place of the two end captions: a scale
   * read at a glance ("½ 1 2 3 Whole pot") where the ends alone say only how
   * far it goes. Each sits under the thumb's centre at that value, and the one
   * the thumb is on is picked out.
   */
  marks?: Array<{ value: number; label: string }>
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
  marks,
}: SliderProps) {
  const width = useSharedValue(0)
  /** The same width, for placing the marks, which are laid out in JS. */
  const [trackWidth, setTrackWidth] = useState(0)
  const dragging = useSharedValue(false)
  const dragValue = useSharedValue(value)

  // While dragging, the thumb follows the finger; otherwise it follows the
  // prop. Reading the prop directly during a drag would fight the gesture on
  // every parent render.
  const current = useDerivedValue(() => (dragging.value ? dragValue.value : value))

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      width.value = event.nativeEvent.layout.width
      setTrackWidth(event.nativeEvent.layout.width)
    },
    [width],
  )

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const emitChange = useCallback((next: number) => {
    onChangeRef.current(next)
  }, [])

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled)
        .minDistance(0)
        .onBegin((event) => {
          dragging.value = true
          const next = positionToValue(event.x, width.value, min, max, step)
          dragValue.value = next
          runOnJS(emitChange)(next)
        })
        .onUpdate((event) => {
          const next = positionToValue(event.x, width.value, min, max, step)
          if (next === dragValue.value) return
          dragValue.value = next
          runOnJS(emitChange)(next)
        })
        .onFinalize(() => {
          dragging.value = false
        }),
    [disabled, dragging, dragValue, emitChange, max, min, step, width],
  )

  /**
   * The thumb travels inside the track rather than across it. At `ratio * width -
   * THUMB / 2` half the thumb hangs outside the track at each end, which in the
   * ask sheet was a thumb cut in half at both extremes, since a sheet's body
   * clips at its own edge.
   *
   * So the travel is the track less the thumb's width, and the fill runs to the
   * thumb's centre rather than its leading edge, or the two come apart by 17pt in
   * the middle. Both halves move together, and so does `positionToValue`.
   */
  const fillStyle = useAnimatedStyle(() => {
    const travel = Math.max(0, width.value - THUMB)
    // Nothing at all before the first layout: a stub of pandan under a thumb
    // that has not been placed yet is a slider drawing a value it does not have.
    if (travel <= 0) return { width: 0 }
    return { width: ratio(current.value, min, max) * travel + THUMB / 2 }
  })

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: ratio(current.value, min, max) * Math.max(0, width.value - THUMB) }],
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
          // "Adjustable" promises a swipe up or down moves it, and without these
          // VoiceOver announced a slider that could not be moved at all. One
          // step at a time, or a twentieth of the range when there is no step.
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            if (disabled) return
            const by = step > 0 ? step : (max - min) / 20
            const next = event.nativeEvent.actionName === 'increment' ? value + by : value - by
            onChange(Math.min(max, Math.max(min, Math.round(next * 1e6) / 1e6)))
          }}
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

      {marks ? (
        // Positioned on the thumb's travel, the same arithmetic as `thumbStyle`,
        // so "2" sits exactly under a thumb resting on 2.
        <View
          className="h-[20px]"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {trackWidth > 0
            ? marks.map((mark) => {
                const travel = Math.max(0, trackWidth - THUMB)
                const centre = THUMB / 2 + ratio(mark.value, min, max) * travel
                const first = mark.value <= min
                const last = mark.value >= max
                return (
                  <Text
                    key={mark.value}
                    variant="caption"
                    numberOfLines={1}
                    className={cn(
                      'absolute',
                      mark.value === value ? 'text-pandan-ink' : 'text-faint',
                    )}
                    style={
                      // The ends hang inward from the track's edges rather than
                      // centring and spilling past them.
                      last
                        ? { right: 0 }
                        : first
                          ? { left: 0 }
                          : { left: centre, width: 72, marginLeft: -36, textAlign: 'center' }
                    }
                  >
                    {mark.label}
                  </Text>
                )
              })
            : null}
        </View>
      ) : (
        <View className="flex-row justify-between">
          <Text variant="caption" className="text-faint">
            {format(min)}
          </Text>
          <Text variant="caption" className="text-faint">
            {format(max)}
          </Text>
        </View>
      )}
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
  // The finger is read against the thumb's own travel, for the reason written
  // on `thumbStyle`: the thumb's centre starts half a thumb in from each end,
  // so a touch mapped over the full width would land the handle short of the
  // finger at one end and past it at the other.
  const travel = width - THUMB
  if (travel <= 0) return min
  const raw = min + (Math.min(travel, Math.max(0, x - THUMB / 2)) / travel) * (max - min)
  if (step <= 0) return raw
  const snapped = Math.round(raw / step) * step
  // Snapping in floating point is where "75.60000000000001" comes from: 756 * 0.1
  // is not 75.6. Six decimals is finer than any step this app uses — 1, 0.5, 0.1 —
  // so this only removes the error the multiplication introduced, and it leaves
  // the value safe to print, store and compare.
  const clean = Math.round(snapped * 1e6) / 1e6
  return Math.min(max, Math.max(min, clean))
}
