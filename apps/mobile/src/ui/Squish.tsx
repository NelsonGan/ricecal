import { type ReactNode, useCallback } from 'react'
import { type PressableProps, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { motion, radius as radiusScale, slab } from '@/theme/tokens'
import { cn } from './cn'
import { Tappable } from './Tappable'

export type SquishProps = Omit<PressableProps, 'children' | 'style'> & {
  /** Height of the slab under the surface. 0 renders flat but keeps the layers. */
  depth?: number
  /** Applied to every layer so their silhouettes line up. */
  radius?: number
  /**
   * Layout for the whole control: `flex-1`, `w-full`, `self-start`, margins.
   * This is the box the parent measures, and it paints nothing.
   */
  containerClassName?: string
  /** The slab's colour. Only ever visible as the strip under the surface. */
  slabClassName?: string
  /** The surface — background, border, padding, content layout. */
  className?: string
  /** Light impact on press-in. On by default: the whole point is squishiness. */
  haptics?: boolean
  children?: ReactNode
}

/**
 * The squishy press mechanic, factored out so every raised control behaves
 * identically: buttons, chips, steppers, the FAB, date cells, tiles.
 *
 * The slab is a view behind the surface rather than a `box-shadow`. It costs one
 * view, and buys three things a shadow cannot: the press animation is a pure
 * `translateY`, so it runs on the UI thread and never drops a frame; the slab is
 * a real layout box, so a pressed control cannot overflow its parent; and it
 * renders identically on both platforms instead of depending on Android's
 * elevation model.
 *
 * Three layers, each with one job:
 *
 *   container  reserves `depth` of extra height, clips, paints nothing
 *   slab       absolutely fills the container, so it shows in that extra height
 *   surface    sits at the top of the container and holds the content
 *
 * Both the slab and the surface translate down by `depth` on press. That is the
 * detail that makes it read as a squish rather than a slide: the slab travels
 * with the surface and stays hidden behind it, so the pressed control is just
 * the surface sitting `depth` lower, and the space it vacated at the top shows
 * the page. Translating only the surface leaves the slab behind and the button
 * appears to grow a dark rim along its top edge — the opposite of a shadow
 * collapsing, which is what the design calls for.
 *
 * The container paints nothing for the same reason. Give it a background and
 * that vacated strip shows the background instead of the page.
 *
 * Every layer is always rendered, even at `depth: 0`. Collapsing to one view
 * would mean layout props have to move between layers as a control becomes
 * selected, and a tree that restructures on state change is a tree that loses
 * its animation halfway through.
 */
export function Squish({
  depth = slab.lg,
  radius = radiusScale.md,
  containerClassName,
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

  // Two hooks, one shared value. Reanimated refuses to bind a single
  // `useAnimatedStyle` result to more than one component — do it and the style
  // silently applies to neither, which reads on screen as a control that has
  // stopped responding to touch at all.
  const slabSink = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }))
  const surfaceSink = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }))

  // A card with no handler should not swallow touches meant for the scroll view
  // behind it, so both the Pressable and the animation are opt-in.
  const interactive = !disabled && Boolean(onPress ?? onLongPress)

  // The haptic itself belongs to `Tappable`, which every pressable in the app
  // shares. What is left here is the half that is `Squish`'s own: the sink.
  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (event) => {
      offset.value = withTiming(depth, { duration: motion.pressIn })
      onPressIn?.(event)
    },
    [depth, offset, onPressIn],
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

  const layers = (
    <>
      <Animated.View
        className={cn('absolute inset-0', slabClassName)}
        style={[{ borderRadius: radius }, interactive ? slabSink : null]}
        pointerEvents="none"
      />
      <Animated.View
        className={className}
        style={[{ borderRadius: radius }, interactive ? surfaceSink : null]}
      >
        {children}
      </Animated.View>
    </>
  )

  // Layout lands on the outermost element in both branches, so a caller's
  // `flex-1` / `w-full` / `self-start` reaches the box the parent measures.
  const outer = cn('overflow-hidden', containerClassName)
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
        {layers}
      </View>
    )
  }

  return (
    <Tappable
      className={outer}
      style={box}
      disabled={disabled}
      haptics={haptics}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...rest}
    >
      {layers}
    </Tappable>
  )
}
