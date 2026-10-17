import { useIsFocused } from 'expo-router'
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated'

import { useThemeColors } from '@/theme/useTheme'
import { Icon } from '@/ui'

const SIZE = 18
/** A frame longer than this (the app was in the background) is not counted as time beating. */
const MAX_FRAME_MS = 100

/**
 * The logger's heart while a watch streams, beating at the rate it reports so
 * the figure beside it reads as live rather than as a number someone typed.
 *
 * Driven by a phase that advances each frame at the current rate, not by a
 * repeating timing: a new reading every few seconds would restart a repeat
 * mid-beat and make it stutter, where a phase only changes its tempo. Each beat
 * is a double thump with a ring spreading out behind it.
 *
 * Still under Reduce Motion, and paused while another screen covers the logger.
 */
export function LiveHeart({ bpm }: { bpm: number }) {
  const colors = useThemeColors()
  const reduced = useReducedMotion()
  const focused = useIsFocused()
  const rate = useSharedValue(bpm)
  const phase = useSharedValue(0)

  useEffect(() => {
    rate.set(bpm)
  }, [bpm, rate])

  const beat = useFrameCallback((frame) => {
    const elapsed = Math.min(frame.timeSincePreviousFrame ?? 0, MAX_FRAME_MS)
    phase.set((phase.get() + (elapsed * Math.max(rate.get(), 1)) / 60_000) % 1)
  }, false)

  useEffect(() => {
    beat.setActive(focused && !reduced)
  }, [beat, focused, reduced])

  const heart = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(phase.get(), [0, 0.1, 0.2, 0.3, 0.45, 1], [1, 1.22, 1, 1.12, 1, 1]) },
    ],
  }))
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(phase.get(), [0, 0.06, 0.7], [0, 0.4, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(phase.get(), [0, 0.7], [0.7, 1.9], Extrapolation.CLAMP) }],
  }))

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      {reduced ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              width: SIZE,
              height: SIZE,
              borderRadius: SIZE / 2,
              backgroundColor: colors.hibiscus,
            },
            ring,
          ]}
        />
      )}
      <Animated.View style={heart}>
        <Icon set="body" name="heart-rate" size={SIZE} />
      </Animated.View>
    </View>
  )
}
