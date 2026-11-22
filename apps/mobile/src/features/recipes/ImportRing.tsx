import { Canvas, Path, Skia } from '@shopify/react-native-skia'
import { type ReactNode, useEffect, useMemo } from 'react'
import { View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { useThemeColors } from '@/theme/useTheme'

/** How much of the circle the moving arc covers, in degrees. */
const SWEEP = 110
/** One turn. Slow enough to read as calm work, fast enough to read as work. */
const TURN_MS = 1400

export type ImportRingProps = {
  /** The ring's outer size, in points. */
  size: number
  thickness?: number
  /** What sits in the middle: the platform's logo. */
  children: ReactNode
}

/**
 * An arc going round a pale track, around whatever is in the middle, while a
 * video becomes a recipe.
 *
 * It turns rather than fills, because nothing reports how far along the
 * server is: the steps under it advance on timers, and a ring that crept
 * towards full would promise a finish it cannot see. Only the arc's layer
 * turns, as a transform on the UI thread, so a busy JS thread does not stall
 * it. Reduce Motion holds it still; the step list still says what is
 * happening.
 */
export function ImportRing({ size, thickness = 6, children }: ImportRingProps) {
  const colors = useThemeColors()
  const reduceMotion = useReducedMotion()
  const turn = useSharedValue(0)

  useEffect(() => {
    if (reduceMotion) return
    turn.set(withRepeat(withTiming(360, { duration: TURN_MS, easing: Easing.linear }), -1, false))
    return () => cancelAnimation(turn)
  }, [reduceMotion, turn])

  const turning = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }))

  const { track, arc } = useMemo(() => {
    const inset = thickness / 2
    const box = Skia.XYWHRect(inset, inset, size - thickness, size - thickness)
    return {
      track: Skia.PathBuilder.Make().addArc(box, 0, 360).detach(),
      arc: Skia.PathBuilder.Make().addArc(box, -90, SWEEP).detach(),
    }
  }, [size, thickness])

  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Canvas style={{ position: 'absolute', width: size, height: size }} pointerEvents="none">
        <Path path={track} style="stroke" strokeWidth={thickness} color={colors.pandanSoftLine} />
      </Canvas>
      <Animated.View
        style={[{ position: 'absolute', width: size, height: size }, turning]}
        pointerEvents="none"
      >
        <Canvas style={{ width: size, height: size }}>
          <Path
            path={arc}
            style="stroke"
            strokeWidth={thickness}
            strokeCap="round"
            color={colors.pandan}
          />
        </Canvas>
      </Animated.View>
      {children}
    </View>
  )
}
