import { cssInterop } from 'nativewind'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Keyboard,
  Platform,
  ScrollView,
  type ScrollViewProps,
  useWindowDimensions,
  View,
} from 'react-native'
import { ScrollView as RawGestureScrollView } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { spacing } from '@/theme/tokens'
import { cn } from './cn'

/**
 * Gesture-handler's ScrollView, taught `className`.
 *
 * NativeWind converts className to style for the components it ships support
 * for, which are React Native's own. A third-party component takes `className`
 * as an ordinary prop and drops it — no warning, no error, an element with
 * none of the styling it was asked for. Without this registration the scroll
 * view below loses its `flex-1`.
 */
const GestureScrollView = cssInterop(RawGestureScrollView, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
})

/**
 * How far the keyboard reaches up into this view, as something to translate by.
 *
 * A NUMBER OF POINTS ON iOS AND ALWAYS ZERO ON ANDROID, where `adjustResize` —
 * which Expo sets by default — has already resized the window out from under
 * the keyboard, and lifting anything again would count it twice. `up` is the
 * plain fact of a keyboard being on screen, and is true on both.
 *
 * `keyboardWillChangeFrame` rather than a will-show and a will-hide, which is
 * the event `KeyboardAvoidingView` picks for the same job: one notification
 * covers arriving, leaving, growing a suggestion bar, and the interactive
 * drag-to-dismiss, where nothing else fires until the finger lets go.
 */
function useKeyboardRise(windowHeight: number) {
  const [up, setUp] = useState(() => Keyboard.isVisible())
  /** Negative, because everything it moves travels upwards. */
  const shift = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      const shown = Keyboard.addListener('keyboardDidShow', () => setUp(true))
      const hidden = Keyboard.addListener('keyboardDidHide', () => setUp(false))
      return () => {
        shown.remove()
        hidden.remove()
      }
    }

    const change = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      const overlap = Math.max(0, windowHeight - event.endCoordinates.screenY)
      setUp(overlap > 0)
      // The keyboard's own duration and no less than a frame of it, so the
      // footer travels with the keys rather than jumping to where they are
      // about to be. This is what `KeyboardAvoidingView` was doing through
      // LayoutAnimation, and a transform can be handed to the native driver.
      Animated.timing(shift, {
        toValue: -overlap,
        duration: Math.max(event.duration, 10),
        useNativeDriver: true,
      }).start()
    })
    return () => change.remove()
  }, [shift, windowHeight])

  return { up, shift }
}

export type ScreenProps = Omit<ScrollViewProps, 'contentContainerStyle'> & {
  children: ReactNode
  /** Content pinned below the scroll area — the footer CTA. Never scrolls away. */
  footer?: ReactNode
  /**
   * Content laid OVER the scroll area, pinned to its bottom-right corner — the
   * floating action on Today.
   *
   * Not the same thing as `footer`, which is a row the content is laid out
   * above: this overlaps, so the last card scrolls under it. That is the trade a
   * floating button makes and the reason it is a separate slot — a screen using
   * it owes its scroll content enough bottom padding that the last row can be
   * read, and the caller is the only one who knows how much.
   */
  floating?: ReactNode
  /** Drop the 20pt screen gutter, for content that bleeds to the edge. */
  flush?: boolean
  /** Render children in a plain View instead of a ScrollView. */
  scroll?: boolean
  /**
   * Scroll with gesture-handler's ScrollView instead of the platform one, for
   * a screen whose rows carry pan gestures of their own.
   *
   * The swipe-to-delete on a diary row needs it: inside the platform
   * ScrollView its pan never activates at all — no drag, no error, nothing to
   * debug — because the two are arbitrating through different systems. Inside
   * this one they negotiate, and the row slides.
   *
   * Off by default, and only Today asks for it — the only screen that renders
   * a swipeable row.
   *
   * It was briefly on everywhere, and the entry screen's macro rows collapsed
   * under a keyboard. That turned out to be `MacroBars` carrying its own
   * `flex-1` into a column, which is fixed at the source; how much this scroll
   * view contributed is not something the evidence separates, since swapping
   * it back also made the symptom go. Left scoped because the narrow thing is
   * the safe thing and nothing else needs it.
   */
  gestureScroll?: boolean
  className?: string
  contentClassName?: string
}

/**
 * The screen shell: canvas background, safe-area insets, gutter, and keyboard
 * handling.
 *
 * Keyboard behaviour is the reason this exists rather than each screen wiring
 * its own ScrollView. Three things:
 *
 * - `automaticallyAdjustKeyboardInsets` (iOS) lets UIKit inset the scroll view
 *   by the real keyboard frame and scroll the focused field up off the keys,
 *   which is more accurate than measuring either in JS and handles the hardware
 *   keyboard and the floating iPad one for free.
 * - The footer CTA is TRANSLATED above the keyboard, and the translate is the
 *   important word. It used to be a `KeyboardAvoidingView` padding this whole
 *   view instead, and the two DID double-count, whatever the note here used to
 *   claim about the padding shrinking the scroll view before UIKit could
 *   measure any overlap. UIKit measures on the keyboard notification, BEFORE a
 *   re-render can reach the layout, and never measures again: the scroll view
 *   was lifted clear of the keyboard and then inset by the height of a keyboard
 *   that no longer touched it. That is a couple of hundred points of nothing
 *   that a screen can be scrolled into and rest in, which is what the entry
 *   screen showed every time a figure was tapped and the number pad came up —
 *   a card floating in a field of canvas with its own buttons stranded below
 *   it. A transform moves no frame, so UIKit's measurement stays true.
 * - `keyboardShouldPersistTaps="handled"` makes the first tap on a button
 *   activate it instead of being eaten dismissing the keyboard. Without it
 *   every form needs two taps to submit.
 *
 * Android does none of the lifting: `adjustResize` resizes the window, so the
 * footer is already above the keys.
 */
export function Screen({
  children,
  footer,
  floating,
  flush = false,
  scroll = true,
  gestureScroll = false,
  className,
  contentClassName,
  ...rest
}: ScreenProps) {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const { up, shift } = useKeyboardRise(windowHeight)
  /**
   * The footer's own height, for the padding below.
   *
   * Measured rather than guessed because it is whatever the screen put in the
   * slot: one button, two side by side, a button over a line of small print.
   */
  const [footerHeight, setFooterHeight] = useState(0)
  // Lifted, as opposed to merely having a keyboard on screen. See the hook.
  const lifted = up && Platform.OS === 'ios'
  const Scroller = gestureScroll ? GestureScrollView : ScrollView

  const body = scroll ? (
    <Scroller
      className={cn('flex-1', contentClassName)}
      contentContainerStyle={{
        padding: flush ? 0 : spacing.gutter,
        // Every route draws its own title bar with `headerShown: false`, so the
        // status bar is this view's problem. Without the top inset the first
        // line of every screen sits under the clock.
        paddingTop: (flush ? 0 : spacing.gutter) + insets.top,
        // And room for the footer while it is riding over the content rather
        // than sitting below it. Without this the last card can only be
        // scrolled as far as the keyboard's top edge, which is behind the
        // buttons.
        paddingBottom:
          (flush ? 0 : spacing.gutter) + (footer ? (lifted ? footerHeight : 0) : insets.bottom),
        gap: spacing.stack,
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      showsVerticalScrollIndicator={false}
      {...rest}
    >
      {children}
    </Scroller>
  ) : (
    <View
      className={cn('flex-1', !flush && 'p-gutter', contentClassName)}
      style={{ gap: spacing.stack, paddingTop: (flush ? 0 : spacing.gutter) + insets.top }}
    >
      {children}
    </View>
  )

  return (
    <View className={cn('flex-1 bg-canvas', className)}>
      {body}

      {/* Riding up with the keyboard rather than sitting under it, the same as
          the footer below.

          One gutter off this view's bottom and NO safe-area inset, which looks
          like an oversight and is the correction for one. A floating control's
          host is a tab screen, and `TabSlot` is a sibling of the nav bar rather
          than its parent: the slot's frame already stops where the bar begins,
          and the bar is what pads for the home indicator. Adding `insets.bottom`
          here counted it a second time and left the button floating a
          thumb-width too high. */}
      {floating ? (
        <Animated.View
          /* Styled inline rather than through `className`: NativeWind only
             transforms the components it has been taught, and an animated one
             takes the prop and drops it. See `GestureScrollView` above. */
          style={{
            position: 'absolute',
            right: spacing.gutter,
            bottom: spacing.gutter,
            alignItems: 'flex-end',
            transform: [{ translateY: shift }],
          }}
          pointerEvents="box-none"
        >
          {floating}
        </Animated.View>
      ) : null}

      {footer ? (
        <Animated.View
          style={{ transform: [{ translateY: shift }] }}
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        >
          {/* No rule above the footer. The design separates it with space and
              the canvas colour alone, and a hairline under a full-width CTA
              reads as a seam rather than a divider. */}
          <View
            className="gap-md bg-canvas px-gutter pt-md"
            /* The home indicator, EXCEPT while the keyboard is over it. A
               keyboard's frame runs all the way to the bottom edge of the
               screen, so a lifted footer has already cleared the indicator;
               padding for it a second time leaves the CTA floating a
               thumb-width above the keys with nothing in the gap. */
            style={{ paddingBottom: (up ? 0 : insets.bottom) + spacing.md }}
          >
            {footer}
          </View>
        </Animated.View>
      ) : null}
    </View>
  )
}
