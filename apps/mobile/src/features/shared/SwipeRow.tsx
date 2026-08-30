import * as Haptics from 'expo-haptics'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
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
  /**
   * Whether this row's action is parked open, for whoever is drawing over it.
   *
   * Today's floating log button sits at the bottom-right corner, which is
   * exactly where a revealed Delete lands for whichever row happens to be at
   * that height — and the button is drawn above the list, so it took the tap:
   * swipe, aim at the bin, get the log sheet. The screen stands the button
   * aside while anything is open. Reported rather than solved in here because
   * this component has no idea what is over it.
   */
  onOpenChange?: (open: boolean) => void
}

/**
 * A row that slides left to reveal one button: delete.
 *
 * The swipe never deletes by itself. It uncovers the control and stops there,
 * because a gesture that removes a meal on release removes a meal by accident and
 * there is no undo behind it.
 *
 * Settling is a timed slide rather than a spring: the button is parked at a fixed
 * offset, so overshooting means it moves after the finger has left.
 *
 * Two things had to be true first, and neither announced itself: the scrolling
 * ancestor has to be gesture-handler's `ScrollView`, or this pan never activates,
 * and the detector's own child has to be a plain view, or the gesture attaches to
 * nothing. The revealed button is drawn after the row for a related reason: the
 * row's box keeps its full width while its contents slide.
 */
export function SwipeRow({
  children,
  onDelete,
  deleteLabel,
  onPress,
  onOpenChange,
}: SwipeRowProps) {
  const colors = useThemeColors()
  const offset = useSharedValue(0)
  const parked = useSharedValue(false)
  // Plain state, because what depends on it is `pointerEvents`: while closed
  // the button sits transparent over the end of the row, and an invisible
  // control still takes touches — including the start of the next swipe.
  const [open, setOpen] = useState(false)

  /**
   * The listener and the last thing it was told, both behind refs.
   *
   * The unmount effect below has to fire EXACTLY once and only for a row that
   * was actually open, and both halves of that were wrong when this was written
   * against the prop directly. Depending on `onOpenChange` meant the cleanup
   * also ran whenever the caller re-created its callback, reporting a close
   * from a row still sitting there open; and reporting unconditionally meant a
   * row that had already been closed by hand reported a second one on its way
   * out, which the counter above cannot tell from a different row closing.
   */
  const notify = useRef(onOpenChange)
  const reportedOpen = useRef(false)
  useEffect(() => {
    notify.current = onOpenChange
  })

  const settle = useCallback((toOpen: boolean) => {
    setOpen(toOpen)
    if (reportedOpen.current !== toOpen) {
      reportedOpen.current = toOpen
      notify.current?.(toOpen)
    }
    if (toOpen) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }, [])

  // An open row taken off screen — deleted, or refetched out of the list —
  // never settles closed, so whoever stood aside for it would stand aside for
  // good. The row that reported open reports closed on the way out, and one
  // that never did stays quiet.
  useEffect(
    () => () => {
      if (reportedOpen.current) notify.current?.(false)
    },
    [],
  )

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
            // Through `settle` rather than `setOpen`, so this path reports the
            // close like every other one: the row is on its way out and
            // whatever stood aside for it can come back during the slide,
            // instead of waiting for the unmount at the end of it.
            settle(false)
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
