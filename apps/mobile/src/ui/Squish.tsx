import * as Haptics from 'expo-haptics'
import { type ReactNode, useCallback } from 'react'
import { Pressable, type PressableProps, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { motion, radius as radiusScale, slab } from '@/theme/tokens'
import { cn } from './cn'

export type SquishProps = Omit<PressableProps, 'children' | 'style'> & {
  /** Height of the slab under the surface. 0 renders flat but keeps the layers. */
  depth?: number
  /** Applied to both layers so their silhouettes line up. */
  radius?: number
  /**
   * Classes for the slab layer. Its colour is the only part ever visible, but
   * it is also the outer box — put layout (`flex-1`, `w-full`) here.
   */
  slabClassName?: string
  /** Classes for the surface layer — background, border, padding, content layout. */
  className?: string
  /** Light impact on press-in. On by default: the whole point is squishiness. */
  haptics?: boolean
  children?: ReactNode
}

/**
 * The squishy press mechanic, factored out so every raised control behaves
 * identically: buttons, chips, steppers, the FAB, date cells, tiles.
 *
 * The slab is a second view behind the surface rather than a `box-shadow`. It
 * costs one view, and buys three things a shadow cannot: the press animation is
 * a pure `translateY`, so it runs on the UI thread and never drops a frame; the
 * slab is a real layout box, so a pressed control cannot overflow its parent;
 * and it renders identically on both platforms instead of depending on
 * Android's elevation model.
 *
 * Geometry: the slab layer is `depth` taller than the surface. Pressing
 * translates the surface down by exactly `depth`, covering the slab and landing
 * the control flush — the same silhouette a `0 Npx 0` shadow gives.
 *
 * Both layers are always rendered, even at `depth: 0`. Collapsing to one view
 * would mean layout props have to move between the layers as a control becomes
 * selected, and a tree that restructures on state change is a tree that loses
 * its animation halfway through.
 */
export function Squish({
  depth = slab.lg,
  radius = radiusScale.md,
  slabClassName,
  className,
  haptics = true,
  disabled,
  children,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  ...rest
}: SquishProps) {
  const offset = useSharedValue(0)
  const surfaceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }))

  // A card with no handler should not swallow touches meant for the scroll view
  // behind it, so both the Pressable and the animation are opt-in.
  const interactive = !disabled && Boolean(onPress ?? onLongPress)

  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (event) => {
      offset.value = withTiming(depth, { duration: motion.pressIn })
      // Never let a haptics failure take down a tap. It is unavailable on
      // simulators and on devices with the setting off.
      if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
      onPressIn?.(event)
    },
    [depth, haptics, offset, onPressIn],
  )

  const handlePressOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (event) => {
      offset.value = withTiming(0, {
        duration: motion.pressOut,
        easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      })
      onPressOut?.(event)
    },
    [offset, onPressOut],
  )

  const surface = (
    <Animated.View
      className={className}
      style={[{ borderRadius: radius }, interactive ? surfaceStyle : null]}
    >
      {children}
    </Animated.View>
  )

  // The slab classes land on the outermost element in both branches, so a
  // caller's layout (`flex-1`, `w-full`, `self-start`) reaches the box the
  // parent actually measures.
  const outer = cn('overflow-hidden', slabClassName)
  const box = { borderRadius: radius, paddingBottom: depth }

  // `rest` carries accessibility props and testID but no handlers, so it is
  // forwarded in both branches. A disabled button that vanished from the
  // accessibility tree would be worse than one that is merely unresponsive:
  // VoiceOver would skip it silently instead of saying "dimmed".
  if (!interactive) {
    return (
      // Both computed props sit AFTER the spread: placed before it, `{...rest}`
      // would put the caller's un-merged accessibilityState back.
      <View
        className={outer}
        style={box}
        {...rest}
        accessibilityState={{ disabled: Boolean(disabled), ...rest.accessibilityState }}
        // A Pressable is an accessibility element implicitly; a View is not.
        // Without this a disabled button announces as its inner Text, with no
        // role and no "dimmed". Gated on a role having been asked for —
        // otherwise it would collapse a Card's children into one unreadable node.
        accessible={rest.accessible ?? Boolean(rest.accessibilityRole)}
      >
        {surface}
      </View>
    )
  }

  return (
    <Pressable
      className={outer}
      style={box}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...rest}
    >
      {surface}
    </Pressable>
  )
}
