import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'
import { type LayoutChangeEvent, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

/** How far across the page a drag has to get to commit, as a share of the width. */
const COMMIT_SHARE = 0.26
/** Or how fast it has to be going, in points per second, however far it got. */
const COMMIT_VELOCITY = 480
/** The glide after release. */
const SETTLE_MS = 220

/** One page: its identity, and what it draws. */
export type SwipePage = { key: string; node: ReactNode }

export type SwipePagerProps = {
  /** Exactly three, in order: previous, current, next. */
  pages: readonly [SwipePage, SwipePage, SwipePage]
  /** The user moved one page. `1` forward, `-1` back. */
  onStep: (step: 1 | -1) => void
  /**
   * Whether the pages scroll vertically.
   *
   * When they do, the gesture has to give way: it takes 14 points of horizontal
   * travel to claim a drag and abandons it after 12 points of vertical, because a
   * diary is read down before it is paged across. Where nothing scrolls — a month
   * grid — that restraint only makes the pager feel reluctant.
   */
  scrollablePages?: boolean
}

/**
 * Three pages side by side, always centred on the middle one.
 *
 * The neighbours are real, rendered pages rather than placeholders, so a drag
 * reveals the next day or month rather than a space where one will be. On release
 * the row glides one page over, the caller moves its own cursor, and the offset
 * returns to the middle — which is why the next swipe starts from the same place
 * and the row is never scrolled back.
 *
 * The page keys are what make that seamless. Moving forward, what was the middle
 * page becomes the previous one and keeps its key, so React keeps its subtree, its
 * scroll position and its data; only the new far page mounts, and it is offscreen.
 */
export function SwipePager({ pages, onStep, scrollablePages = false }: SwipePagerProps) {
  /**
   * Seeded from the window rather than from zero.
   *
   * These pagers are full-bleed, so the window width IS the page width, and
   * starting there means the first frame is already three pages centred. From zero
   * the row collapses and the correction lands a frame later — visible as a flinch
   * every time the screen opens.
   */
  const { width: windowWidth } = useWindowDimensions()
  const [width, setWidth] = useState(windowWidth)
  const pageWidth = useSharedValue(windowWidth)
  const drag = useSharedValue(0)

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width
    if (next === width || next === 0) return
    setWidth(next)
    pageWidth.value = next
  }

  /**
   * Step the caller's cursor, and put the row back in the middle.
   *
   * Both in one tick, deliberately: the shared value is written from JS here, so
   * the offset and the new pages reach the UI thread in the same commit. If a frame
   * of the wrong page ever flashes on release, this is the line to look at.
   */
  const commit = useCallback(
    (step: 1 | -1) => {
      onStep(step)
      drag.value = 0
    },
    [onStep, drag],
  )

  // Built in two steps because the vertical give-way is not "a big number" when
  // there is nothing to give way to — it is absent. A page that does not scroll has
  // no competing gesture, so a drag that wanders off the horizontal should still
  // page rather than be abandoned.
  let pan = Gesture.Pan().activeOffsetX(scrollablePages ? [-14, 14] : [-6, 6])
  if (scrollablePages) pan = pan.failOffsetY([-12, 12])

  pan = pan
    .onUpdate((event) => {
      drag.value = event.translationX
    })
    .onEnd((event) => {
      const easing = Easing.out(Easing.cubic)
      const far =
        Math.abs(event.translationX) > pageWidth.value * COMMIT_SHARE ||
        Math.abs(event.velocityX) > COMMIT_VELOCITY

      if (!far || pageWidth.value === 0) {
        drag.value = withTiming(0, { duration: SETTLE_MS, easing })
        return
      }

      // Dragging left goes forward: the page coming in from the right is the next
      // one, the way a stack of cards moves under a thumb.
      const step = event.translationX < 0 ? 1 : -1
      drag.value = withTiming(-step * pageWidth.value, { duration: SETTLE_MS, easing }, (done) => {
        if (done) runOnJS(commit)(step)
      })
    })

  const row = useAnimatedStyle(() => ({
    transform: [{ translateX: -pageWidth.value + drag.value }],
  }))

  return (
    <View className="flex-1 overflow-hidden" onLayout={onLayout}>
      <GestureDetector gesture={pan}>
        <Animated.View className="flex-1 flex-row" style={row}>
          {pages.map((page) => (
            <View key={page.key} style={{ width }}>
              {page.node}
            </View>
          ))}
        </Animated.View>
      </GestureDetector>
    </View>
  )
}
