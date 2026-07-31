import * as Haptics from 'expo-haptics'
import { type ReactNode, useCallback, useState } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { useThemeColors } from '@/theme/useTheme'
import { Icon, Tappable, Text } from '@/ui'

/** Width of the revealed button, and how far the row parks open. */
const ACTION_W = 96
/** Past half of it, letting go opens; short of it, the row closes again. */
const OPEN_AT = ACTION_W / 2
/** How long the row takes to settle either way. */
const SETTLE_MS = 180

export type SwipeRowProps = {
  children: ReactNode
  onDelete: () => void
  /** On the revealed button, and read out by a screen reader. */
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
 * A row that slides left to reveal one button: delete.
 *
 * The swipe never deletes by itself. It uncovers the control and stops there,
 * and the delete happens when that button is pressed — a gesture that removes
 * a meal on release is a gesture that removes a meal by accident, and there is
 * no undo behind it.
 *
 * Settling is a timed slide rather than a spring. A row that bounces past its
 * stop and back reads as slack in the interface, and this one has a button
 * parked at a fixed offset: overshooting it means the button moves after the
 * finger has left.
 *
 * Two things had to be true before any of this worked, and neither announced
 * itself: the scrolling ancestor has to be gesture-handler's `ScrollView`, or
 * this pan never activates at all; and the detector's own child has to be a
 * plain view rather than an animated one, or the gesture attaches to nothing.
 * The revealed button is drawn AFTER the row for the same family of reason —
 * the row's box keeps its full width while its contents slide, so a button
 * underneath it is visible and unpressable.
 */
export function SwipeRow({ children, onDelete, deleteLabel, onPress }: SwipeRowProps) {
  const colors = useThemeColors()
  const offset = useSharedValue(0)
  const parked = useSharedValue(false)
  // Plain state, because what depends on it is `pointerEvents`: while closed
  // the button sits transparent over the end of the row, and an invisible
  // control still takes touches — including the start of the next swipe.
  const [open, setOpen] = useState(false)

  const settle = useCallback((toOpen: boolean) => {
    setOpen(toOpen)
    if (toOpen) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }, [])

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
    .onUpdate((event) => {
      const base = parked.value ? -ACTION_W : 0
      // Never further than the button is wide, and never rightward past
      // closed: there is nothing on either side of those, and moving into
      // empty space suggests there is.
      offset.value = Math.max(-ACTION_W, Math.min(0, base + event.translationX))
    })
    .onEnd((event) => {
      const willOpen = -offset.value >= OPEN_AT || event.velocityX < -700
      parked.value = willOpen
      runOnJS(settle)(willOpen)
      offset.value = withTiming(willOpen ? -ACTION_W : 0, { duration: SETTLE_MS })
    })

  // A tap on an open row closes it rather than opening the dish behind it,
  // which is what every list with a parked action does.
  const tap = Gesture.Tap()
    .maxDuration(500)
    .onEnd(() => {
      if (parked.value) {
        parked.value = false
        runOnJS(settle)(false)
        offset.value = withTiming(0, { duration: SETTLE_MS })
        return
      }
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
  const action = useAnimatedStyle(() => ({
    opacity: Math.min(1, -offset.value / (ACTION_W * 0.5)),
  }))

  return (
    <View className="overflow-hidden rounded-tile">
      <GestureDetector gesture={gesture}>
        <View collapsable={false}>
          <Animated.View style={sliding}>{children}</Animated.View>
        </View>
      </GestureDetector>

      {/* Square-edged and full-bleed, clipped by the row's own corners: a
          rounded pill floating in the gap read as a button that had come
          loose from the row it belongs to. What the eye should see is the row
          sliding to uncover something underneath it. */}
      <Animated.View
        style={action}
        pointerEvents={open ? 'auto' : 'none'}
        className="absolute top-0 right-0 bottom-0 w-[96px] overflow-hidden"
      >
        <Tappable
          className="h-full w-full items-center justify-center gap-1 bg-hibiscus"
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          onPress={() => {
            setOpen(false)
            parked.value = false
            offset.value = withTiming(-600, { duration: 200 }, () => runOnJS(remove)())
          }}
        >
          <Icon set="ui" name="delete" size={20} tintColor={colors.onHibiscus} />
          <Text variant="caption" style={{ color: colors.onHibiscus }}>
            {deleteLabel}
          </Text>
        </Tappable>
      </Animated.View>
    </View>
  )
}
