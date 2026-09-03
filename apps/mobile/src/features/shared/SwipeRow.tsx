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
import { cn, Icon, Tappable, Text } from '@/ui'

/** Width of one revealed button. A row parks open by this times its actions. */
const ACTION_W = 96
/** Past half of what is revealed, letting go opens; short of it, it closes. */
const OPEN_FRACTION = 0.5
/** How long the row takes to settle either way. */
const SETTLE_MS = 180

/**
 * One of the buttons a row uncovers.
 *
 * `label` is the caption, so it has to fit 96 points: a word. `a11yLabel` is
 * what a screen reader says instead, and it exists because the caption cannot
 * say WHICH row — two rows both announcing "Replace" tell a reader nothing.
 */
export type SwipeAction = {
  label: string
  a11yLabel?: string
  icon: 'delete' | 'swap'
  /**
   * The palette this button is set in. Destructive is `hibiscus`; anything that
   * leads somewhere rather than ending something is `water`, so the colour says
   * which of the two a thumb is about to land on before the word is read.
   */
  tone: 'hibiscus' | 'water'
  /**
   * The row slides away as this runs, for an action that takes it off the list.
   * Anything that leaves the row where it is settles closed instead, or the row
   * flies out and comes straight back.
   */
  exits?: boolean
  onPress: () => void
}

export type SwipeRowProps = {
  children: ReactNode
  /**
   * What the row uncovers, nearest the row first, so the outermost button is
   * the one at the end of the drag. Destructive last, which is where iOS puts
   * it and where the thumb ends up on a long swipe.
   */
  actions: readonly SwipeAction[]
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
 * A row that slides left to reveal its actions.
 *
 * The swipe never runs one by itself. It uncovers the control and stops there,
 * because a gesture that removes a meal on release removes a meal by accident and
 * there is no undo behind it. That is truer with two buttons than it was with
 * one: a release cannot mean "delete" when it could equally mean "replace".
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
export function SwipeRow({ children, actions, onPress, onOpenChange }: SwipeRowProps) {
  const colors = useThemeColors()
  // How far the row travels: one button's width per action.
  const reveal = ACTION_W * actions.length
  const openAt = reveal * OPEN_FRACTION
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

  /**
   * ONCE, whatever the animation says.
   *
   * A `withTiming` callback is not a promise: it runs when the animation lands
   * AND again when the animation is cancelled, and an action that takes the row
   * off the list cancels its own by unmounting. So every exiting swipe fired
   * twice, about 120ms apart. Today's list has always done this and never showed
   * it — the second `remove_entry` is a fire-and-forget on a row the server has
   * already deleted, so it fails into nothing — and the plate is where it
   * surfaced, because a failed delete there is reported.
   *
   * A latch rather than reading the callback's `finished`: an action must run
   * exactly once, and "the animation was interrupted" is not the same question.
   */
  const fired = useSharedValue(false)
  const run = useCallback((action: SwipeAction) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    action.onPress()
  }, [])

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
      const base = parked.value ? -reveal : 0
      // Never further than the buttons are wide, and never rightward past
      // closed: there is nothing on either side of those, and moving into
      // empty space suggests there is.
      offset.value = Math.max(-reveal, Math.min(0, base + event.translationX))
    })
    .onEnd((event) => {
      const willOpen = -offset.value >= openAt || event.velocityX < -700
      parked.value = willOpen
      runOnJS(settle)(willOpen)
      offset.value = withTiming(willOpen ? -reveal : 0, { duration: SETTLE_MS })
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
    opacity: Math.min(1, -offset.value / openAt),
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
        style={[action, { width: reveal }]}
        pointerEvents={open ? 'auto' : 'none'}
        className="absolute top-0 right-0 bottom-0 flex-row overflow-hidden"
      >
        {actions.map((item) => (
          <Tappable
            key={item.label}
            className={cn(
              'h-full flex-1 items-center justify-center gap-1',
              item.tone === 'hibiscus' ? 'bg-hibiscus' : 'bg-water',
            )}
            accessibilityRole="button"
            accessibilityLabel={item.a11yLabel ?? item.label}
            onPress={() => {
              // Through `settle` rather than `setOpen`, so this path reports the
              // close like every other one: the row is on its way out and
              // whatever stood aside for it can come back during the slide,
              // instead of waiting for the unmount at the end of it.
              settle(false)
              parked.value = false
              if (!item.exits) {
                offset.value = withTiming(0, { duration: SETTLE_MS })
                run(item)
                return
              }
              offset.value = withTiming(-600, { duration: 200 }, () => {
                if (fired.value) return
                fired.value = true
                runOnJS(run)(item)
              })
            }}
          >
            <Icon
              set="ui"
              name={item.icon}
              size={20}
              tintColor={item.tone === 'hibiscus' ? colors.onHibiscus : colors.onWater}
            />
            <Text
              variant="caption"
              style={{ color: item.tone === 'hibiscus' ? colors.onHibiscus : colors.onWater }}
            >
              {item.label}
            </Text>
          </Tappable>
        ))}
      </Animated.View>
    </View>
  )
}
