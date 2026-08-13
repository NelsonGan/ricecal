import type { ReactNode } from 'react'
import { useCallback, useRef, useState } from 'react'
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { spacing } from '@/theme/tokens'
import { AppBar, StepProgress, Text } from '@/ui'

export type StoryPage = {
  key: string
  node: ReactNode
}

export type StoryFrameProps = {
  title: string
  pages: readonly StoryPage[]
  onClose: () => void
  /** "Close", "Previous", "Next" and the progress bar's name, already translated. */
  labels: {
    close: string
    previous: string
    next: string
    progress: string
  }
  /** "2 of 4". A function because only the caller has the copy bundle. */
  counter: (index: number, total: number) => string
}

/**
 * The strips down either edge that step the story.
 *
 * Narrow, and they used to be a third and two thirds of the width. Then every
 * card became something you tap to share it, and a card that takes its own
 * press is a card the page behind it never hears about — so the zones moved to
 * the EDGES, where a story is tapped anyway and where the page gutter means
 * they overlap only the last few points of a card.
 */
const EDGE_ZONE = 'w-[15%]'

/**
 * The chrome a review is read through: a title, a segmented progress bar, and
 * pages you tap or swipe between.
 *
 * TWO WAYS THROUGH, and they are the same two every story anywhere has. A tap
 * on the left edge goes back, a tap on the right edge or anywhere between the
 * cards goes on, and a horizontal swipe does what the finger says.
 *
 * A tap on a CARD does neither: it lifts that card out as a picture to share.
 * That is why the edges carry the navigation at all — see `EDGE_ZONE`.
 *
 * NO TIMER, and that is the one place this parts company with the stories it
 * borrows from. Instagram advances itself because the content is a photograph
 * somebody has finished reading in a second. These pages are a chart and four
 * figures, and a page that leaves while it is being read is worse than no
 * animation at all.
 *
 * The pages are a paging ScrollView rather than a swapped child, so a swipe
 * follows the finger and lands with the platform's own physics. The cost is
 * that every page is mounted at once, which is what a story wants anyway: the
 * charts are already in hand, and mounting one on arrival would draw an empty
 * card for a frame.
 *
 * THE PAGE ITSELF IS A FORWARD TARGET, as a Pressable wrapped around it, with
 * the two edge strips laid over the top. That shape is not the obvious one and
 * it is the second attempt: the first put the zones UNDER the content, on the
 * reasoning that a plain View never becomes a touch responder, so a tap on a
 * card would fall through to whatever was beneath it. It does not. React Native
 * offers an unclaimed touch to the hit view's ANCESTORS, never to a sibling that
 * happens to overlap it, so every tap that landed on a card did nothing at all —
 * and since the empty canvas below the cards worked, it looked like the last
 * page was broken rather than like most of every page was.
 *
 * As an ancestor it works, and the ordering that follows from it is the whole
 * arrangement: a card claims its own press for the share sheet, the strips over
 * the edges claim theirs for the step, and the page underneath catches whatever
 * is left.
 */
export function StoryFrame({ title, pages, onClose, labels, counter }: StoryFrameProps) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const scroller = useRef<ScrollView>(null)

  /**
   * Which page is showing, held HERE rather than by the screen.
   *
   * It has to live beside the scroll view that moves it. Owned above, the two
   * could disagree: opening a second review reuses this route, so the index
   * reset while the scroller stayed where the last story left it, and the new
   * review opened on its first card under a progress bar counting two.
   */
  const [index, setIndex] = useState(0)

  const goTo = useCallback(
    (next: number) => {
      // Forward off the end closes the story, which is what every story does
      // and what somebody tapping through at speed expects. Back off the front
      // does nothing: there is a cross for leaving, and dismissing a review
      // because a tap landed a few points too far left would be a surprise.
      if (next >= pages.length) {
        onClose()
        return
      }
      if (next < 0 || next === index) return

      scroller.current?.scrollTo({ x: next * width, animated: true })
      setIndex(next)
    },
    [index, onClose, pages.length, width],
  )

  const settle = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const landed = Math.round(event.nativeEvent.contentOffset.x / width)
      if (landed !== index) setIndex(landed)
    },
    [index, width],
  )

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <AppBar
        title={title}
        onBack={onClose}
        leading="dismiss"
        backLabel={labels.close}
        action={
          <Text variant="label" className="text-muted">
            {counter(index, pages.length)}
          </Text>
        }
      />

      {/* Room under the marks. At a couple of points the bar read as part of
          the first card rather than as chrome above it, which is the one thing
          a progress bar must not do. */}
      <StepProgress
        total={pages.length}
        current={index + 1}
        accessibilityLabel={labels.progress}
        className="px-gutter pb-3"
      />

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // Where a swipe LANDED, rather than where it is. Nothing here reacts to
        // a partial one, so there is no `onScroll` and nothing to throttle.
        onMomentumScrollEnd={settle}
        className="flex-1"
      >
        {pages.map((page, position) => (
          <Pressable
            key={page.key}
            style={{ width }}
            className="flex-1"
            onPress={() => goTo(position + 1)}
            /* NOT an accessibility element, though it is the biggest touch
               target on the screen. A Pressable with a role collapses its whole
               subtree into one node, so this page announced itself as a single
               "Next" button and the cards inside it — each of which is a button
               that shares itself — could not be reached at all. The two strips
               below carry the labels instead, and everything between them stays
               reachable. */
            accessible={false}
          >
            {/* Three quarters of the gutter and none of the gap, because
                every card on a page is wrapped in a `Shareable` that carries
                the other quarter as padding — the margin its captured picture
                needs. Cards land exactly where they did. */}
            <View
              className="flex-1 px-3 pt-3"
              style={{ paddingBottom: insets.bottom + spacing.gutter }}
            >
              {page.node}
            </View>

            {/* Last, so they lie OVER the cards rather than under them. Under
                them they would only work on the empty canvas below the last
                card, which is the trap the header describes. */}
            <Pressable
              className={`absolute inset-y-0 left-0 ${EDGE_ZONE}`}
              onPress={() => goTo(position - 1)}
              accessibilityRole="button"
              accessibilityLabel={labels.previous}
            />
            <Pressable
              className={`absolute inset-y-0 right-0 ${EDGE_ZONE}`}
              onPress={() => goTo(position + 1)}
              accessibilityRole="button"
              accessibilityLabel={labels.next}
            />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}
