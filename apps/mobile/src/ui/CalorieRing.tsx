import { Canvas, Path, Skia } from '@shopify/react-native-skia'
import { useEffect } from 'react'
import { View } from 'react-native'
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated'

import { motion } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { Text } from './Text'

export type CalorieRingProps = {
  /** Calories consumed so far. */
  value: number
  /** The day's target. */
  goal: number
  /** Big number in the middle. Defaults to calories remaining. */
  centerLabel?: string
  /** Small caps line under it. */
  centerCaption?: string
  size?: number
  thickness?: number
  /**
   * Pins the fill colour. Without it the ring picks pandan, kaya or hibiscus
   * from how full it is, which is right for calories and wrong for a ring
   * measuring anything else.
   */
  tone?: 'pandan' | 'kaya' | 'hibiscus' | 'water'
  className?: string
}

/**
 * The calorie ring.
 *
 * Fills clockwise from twelve o'clock, turns kaya at 90% and hibiscus past
 * 100%. Deliberately never alarm styling — going over is information, not a
 * failure, and the copy elsewhere says so.
 *
 * Drawn with Skia rather than three nested views because the arc has to sweep
 * a partial angle. The sweep is a Reanimated derived value, so the fill
 * animation runs on the UI thread without a re-render per frame.
 */
export function CalorieRing({
  value,
  goal,
  centerLabel,
  centerCaption = 'kcal left',
  size = 196,
  thickness = 21,
  tone,
  className,
}: CalorieRingProps) {
  const colors = useThemeColors()
  const fraction = goal > 0 ? value / goal : 0
  const swept = Math.min(1, Math.max(0, fraction))

  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = withTiming(swept, {
      duration: motion.fill,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    })
  }, [swept, progress])

  const inset = thickness / 2
  const box = { x: inset, y: inset, width: size - thickness, height: size - thickness }

  // `PathBuilder` rather than `Path.Make()`: the mutable-path API is deprecated
  // in Skia 2.x and warns on every call. `detach()` over `build()` because the
  // builder is thrown away immediately either way.
  const track = Skia.PathBuilder.Make().addArc(box, 0, 360).detach()

  // Rebuilt per frame on the UI thread, which is what keeps the fill animation
  // off the JS thread entirely.
  const arc = useDerivedValue(() =>
    Skia.PathBuilder.Make()
      .addArc(box, -90, progress.value * 360)
      .detach(),
  )

  const fill = tone
    ? colors[tone]
    : fraction > 1
      ? colors.hibiscus
      : fraction >= 0.9
        ? colors.kaya
        : colors.pandan
  const remaining = Math.max(0, Math.round(goal - value))

  // The centre number is sized from the ring rather than fixed, so a 110pt ring
  // in a stat card and a 186pt one on the target screen both read as designed.
  const labelSize = Math.round(size * 0.22)

  return (
    <View
      className={cn('items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <Canvas style={{ width: size, height: size }}>
        <Path path={track} style="stroke" strokeWidth={thickness} color={colors.track} />
        <Path path={arc} style="stroke" strokeWidth={thickness} color={fill} />
      </Canvas>

      <View
        className="absolute items-center justify-center"
        accessibilityRole="progressbar"
        accessibilityLabel={`${value} of ${goal} kcal`}
        accessibilityValue={{ min: 0, max: goal, now: value }}
      >
        <Text
          className="font-display text-heading"
          style={{ fontSize: labelSize, lineHeight: Math.round(labelSize * 1.2) }}
        >
          {centerLabel ?? remaining.toLocaleString()}
        </Text>
        <Text
          variant="overline"
          className="text-muted"
          style={{ fontSize: Math.max(10, Math.round(size * 0.065)) }}
        >
          {centerCaption}
        </Text>
      </View>
    </View>
  )
}
