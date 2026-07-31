import * as Haptics from 'expo-haptics'
import { type ReactNode, useCallback } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { useThemeColors } from '@/theme/useTheme'
import { Icon, Text } from '@/ui'

/** How far the row has to travel before letting go removes it. */
const COMMIT = 140

export type SwipeRowProps = {
  children: ReactNode
  onDelete: () => void
  /** Named on the panel behind the row, and to a screen reader. */
  deleteLabel: string
  /**
   * The row's own tap, handled HERE rather than by a `Pressable` inside the
   * row. Two systems were arbitrating for the same touch — gesture-handler's
   * pan against React Native's touch responder — and the responder won, so
   * every swipe opened the dish instead of sliding it. Racing the tap against
   * the pan in one detector makes the outcome decidable.
   */
  onPress?: () => void
}

/**
 * A row that is deleted by pushing it off the left of the screen.
 *
 * Not a drawer with a button parked in it. That shape needs the revealed
 * button to sit above the row it came out from, the row to stop taking touches
 * over it, and a second gesture to close it again — three moving parts, and in
 * this tree the button ended up unreachable whichever way round they went.
 * Pushing the row out is one gesture with one threshold: past it the meal goes
 * and the toast says so, short of it the row springs back.
 *
 * So what is behind the row is not a control — it is the reason, in hibiscus,
 * so the direction reads as destructive before the finger commits.
 *
 * Two things had to be true before any of this worked, and neither announced
 * itself: the scrolling ancestor has to be gesture-handler's `ScrollView`, or
 * this pan never activates at all; and the detector's own child has to be a
 * plain view rather than an animated one, or the gesture attaches to nothing.
 */
export function SwipeRow({ children, onDelete, deleteLabel, onPress }: SwipeRowProps) {
  const colors = useThemeColors()
  const offset = useSharedValue(0)

  const remove = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    onDelete()
  }, [onDelete])

  const press = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    onPress?.()
  }, [onPress])

  const pan = Gesture.Pan()
    // Horizontal only, and only after a clear sideways intent: the list under
    // this scrolls vertically, and a row that steals a scroll is worse than a
    // row with no gesture at all.
    .activeOffsetX([-16, 16])
    .failOffsetY([-12, 12])
    // Leftward only. There is nothing on the other side, and rubber-banding
    // into empty space suggests there is.
    .onUpdate((event) => {
      offset.value = Math.min(0, event.translationX)
    })
    .onEnd((event) => {
      // Distance OR speed. A deliberate push across counts, and so does a
      // quick flick — asking for both is how a gesture ends up feeling stiff.
      if (-offset.value >= COMMIT || event.velocityX < -900) {
        offset.value = withTiming(-600, { duration: 200 }, () => runOnJS(remove)())
        return
      }
      offset.value = withSpring(0, { damping: 20, stiffness: 220 })
    })

  const tap = Gesture.Tap()
    .maxDuration(500)
    .onEnd(() => {
      if (onPress) runOnJS(press)()
    })

  // Race, not Exclusive. Exclusive makes the tap wait for the pan to FAIL, and
  // in this tree that left the pan never activating at all. Racing is also the
  // truer description: a finger that moves is dragging, one that does not is
  // tapping, and whichever recognises first wins.
  const gesture = Gesture.Race(pan, tap)

  const sliding = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
    backgroundColor: colors.surface,
  }))
  // The panel behind grows more certain as the row travels, reaching full
  // strength exactly where letting go would delete.
  const behind = useAnimatedStyle(() => ({
    opacity: Math.min(1, -offset.value / COMMIT),
  }))

  return (
    <View className="overflow-hidden rounded-tile">
      <Animated.View
        style={behind}
        pointerEvents="none"
        className="absolute inset-0 flex-row items-center justify-end gap-2 rounded-tile bg-hibiscus pr-5"
      >
        <Text variant="label" style={{ color: colors.onHibiscus }}>
          {deleteLabel}
        </Text>
        <Icon set="ui" name="delete" size={22} tintColor={colors.onHibiscus} />
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <View collapsable={false}>
          <Animated.View style={sliding}>{children}</Animated.View>
        </View>
      </GestureDetector>
    </View>
  )
}
