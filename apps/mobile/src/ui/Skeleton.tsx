import { useEffect } from 'react'
import { ActivityIndicator, type DimensionValue, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { Text } from './Text'

export type SkeletonProps = {
  width?: DimensionValue
  height?: number
  /** Pill by default; square off for image and card placeholders. */
  rounded?: boolean
  className?: string
}

/**
 * A pulsing placeholder block.
 *
 * Opacity rather than a moving gradient sweep: the sweep needs a masked
 * gradient per block, and at three or four blocks per row that is a lot of
 * layers for something the user sees for 400ms.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  rounded = true,
  className,
}: SkeletonProps) {
  const pulse = useSharedValue(0.55)

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    )
  }, [pulse])

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }))

  return (
    <Animated.View
      className={cn('bg-track', rounded ? 'rounded-full' : 'rounded-sm', className)}
      style={[{ width, height }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  )
}

export type SkeletonRowProps = {
  /** Leading square, for a dish thumbnail. */
  avatar?: boolean
  className?: string
}

/** The two-line placeholder used while a food search resolves. */
export function SkeletonRow({ avatar = true, className }: SkeletonRowProps) {
  return (
    <View className={cn('flex-row items-center gap-md', className)}>
      {avatar ? <Skeleton width={52} height={52} rounded={false} /> : null}
      <View className="flex-1 gap-2">
        <Skeleton width="70%" />
        <Skeleton width="45%" height={12} />
      </View>
    </View>
  )
}

export type SpinnerProps = {
  label?: string
  size?: 'small' | 'large'
  className?: string
}

/** A spinner with an optional label, for waits with nothing to place-hold. */
export function Spinner({ label, size = 'large', className }: SpinnerProps) {
  const colors = useThemeColors()

  return (
    <View
      className={cn('flex-row items-center gap-md', className)}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
    >
      <ActivityIndicator size={size} color={colors.pandan} />
      {label ? (
        <Text variant="label" className="text-muted">
          {label}
        </Text>
      ) : null}
    </View>
  )
}
