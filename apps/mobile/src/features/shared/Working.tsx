import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Animated, Easing } from 'react-native'
import Reanimated, {
  Easing as ReanimatedEasing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

/**
 * The status line and bar of a model call the client cannot watch: a scan on
 * Today, a pot being read into a recipe.
 *
 * The progress is honest theatre. The bar eases toward full without reaching it,
 * which says "working, not stuck" more strongly than a spinner, and the line
 * under it cycles through the stages every `phraseMs`. Whatever shows it is
 * replaced wholesale when the answer lands, so the bar never has to finish.
 *
 * `width` is an `Animated` interpolation: width in percent is a layout property,
 * so the native driver cannot animate it.
 */
export function useWorkingStatus(
  phrases: readonly string[],
  { phraseMs, fillMs, from }: { phraseMs: number; fillMs: number; from: `${number}%` },
) {
  const [phrase, setPhrase] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setPhrase((current) => current + 1), phraseMs)
    return () => clearInterval(id)
  }, [phraseMs])

  const progress = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: fillMs,
      // Quadratic out, the shape every real download bar has. Cubic spent its
      // first second covering a third of the bar and then crawled, which reads
      // as a stall.
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start()
  }, [progress, fillMs])

  return {
    label: phrases[phrase % phrases.length],
    width: progress.interpolate({ inputRange: [0, 1], outputRange: [from, '92%'] }),
  }
}

/**
 * A slow pulse over a status line. A hard cut between two sentences every few
 * seconds reads as a glitch, and a slow breath through the change says "still
 * working" in the one place the eye already is. Reanimated rather than
 * `Animated`, because it repeats forever and belongs on the UI thread.
 */
export function Shimmer({ children }: { children: ReactNode }) {
  const pulse = useSharedValue(1)
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.45, { duration: 1100, easing: ReanimatedEasing.inOut(ReanimatedEasing.quad) }),
      -1,
      true,
    )
  }, [pulse])
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }))
  return <Reanimated.View style={style}>{children}</Reanimated.View>
}
