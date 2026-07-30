import { addDays, parseISO } from 'date-fns'
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

import { dateKey, type Entry } from '@/data'
import { DayPanel } from './DayPanel'

/** How far across the page a drag has to get to commit, as a share of the width. */
const COMMIT_SHARE = 0.26
/** Or how fast it has to be going, in points per second, however far it got. */
const COMMIT_VELOCITY = 480
/** The glide after release. */
const SETTLE_MS = 220

export type DayPagerProps = {
  /** ISO key of the day on screen. */
  date: string
  onDateChange: (date: string) => void
  onPressEntry: (entry: Entry) => void
  onFixEntry: (entry: Entry) => void
  bottomInset: number
}

/**
 * The diary's days, one swipe apart.
 *
 * Three pages wide and always centred on the middle one: yesterday sits to the
 * left, tomorrow to the right, both fully rendered so a swipe reveals a real day
 * rather than a spinner. On release the row glides to the neighbour, the date
 * changes, and the offset returns to the middle — so the next swipe starts from
 * the same place and the row never has to be scrolled back.
 *
 * The gesture is deliberately hard to trigger by accident: it needs 14 points of
 * horizontal travel to activate and gives up at 12 points of vertical, because
 * every page is a scroll view and a diary is something you read down before you
 * page across. Those two numbers are the whole difference between a pager that
 * feels responsive and one that steals every flick of the day's contents.
 */
export function DayPager({
  date,
  onDateChange,
  onPressEntry,
  onFixEntry,
  bottomInset,
}: DayPagerProps) {
  /**
   * Seeded from the window rather than from zero.
   *
   * This pager is full-bleed, so the window width IS the page width, and starting
   * there means the first frame is already three pages side by side and centred.
   * From zero the row collapses, the transform is meaningless, and the correction
   * lands a frame later — visible as a flinch every time the tab is opened.
   */
  const { width: windowWidth } = useWindowDimensions()
  const [width, setWidth] = useState(windowWidth)
  const pageWidth = useSharedValue(windowWidth)
  const drag = useSharedValue(0)

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width
    if (next === width) return
    setWidth(next)
    pageWidth.value = next
  }

  /**
   * Move a day, and put the row back in the middle.
   *
   * Both in one tick, deliberately: the shared value is written from JS here, so
   * the offset and the new dates reach the UI thread in the same commit. If a
   * frame of the wrong day ever flashes on release, this is the line to look at.
   */
  const commit = useCallback(
    (step: number) => {
      onDateChange(dateKey(addDays(parseISO(date), step)))
      drag.value = 0
    },
    [date, onDateChange, drag],
  )

  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      drag.value = event.translationX
    })
    .onEnd((event) => {
      const far =
        Math.abs(event.translationX) > pageWidth.value * COMMIT_SHARE ||
        Math.abs(event.velocityX) > COMMIT_VELOCITY
      const easing = Easing.out(Easing.cubic)

      if (!far || pageWidth.value === 0) {
        drag.value = withTiming(0, { duration: SETTLE_MS, easing })
        return
      }

      // Dragging left goes forward: the page coming in from the right is the next
      // day, the way a stack of cards moves under a thumb.
      const step = event.translationX < 0 ? 1 : -1
      drag.value = withTiming(-step * pageWidth.value, { duration: SETTLE_MS, easing }, (done) => {
        if (done) runOnJS(commit)(step)
      })
    })

  const row = useAnimatedStyle(() => ({
    transform: [{ translateX: -pageWidth.value + drag.value }],
  }))

  const anchor = parseISO(date)
  const pages = [-1, 0, 1].map((offset) => dateKey(addDays(anchor, offset)))

  return (
    <View className="flex-1 overflow-hidden" onLayout={onLayout}>
      <GestureDetector gesture={pan}>
        <Animated.View className="flex-1 flex-row" style={row}>
          {pages.map((key) => (
            <View key={key} style={{ width }}>
              <DayPanel
                date={key}
                onPressEntry={onPressEntry}
                onFixEntry={onFixEntry}
                bottomInset={bottomInset}
              />
            </View>
          ))}
        </Animated.View>
      </GestureDetector>
    </View>
  )
}
