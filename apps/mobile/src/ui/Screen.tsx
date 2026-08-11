import { cssInterop } from 'nativewind'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
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
 * Whether the soft keyboard is on screen. ANDROID's half of the footer's
 * bottom padding — see the footer for what it is for, and `useKeyboardLift`
 * for what iOS does instead.
 */
function useKeyboardOpen(enabled: boolean) {
  // Asked rather than assumed, for a screen that mounts under a keyboard
  // somebody else raised: no `did-show` is coming for one already up.
  const [open, setOpen] = useState(() => enabled && Keyboard.isVisible())

  useEffect(() => {
    if (!enabled) return
    const shown = Keyboard.addListener('keyboardDidShow', () => setOpen(true))
    const hidden = Keyboard.addListener('keyboardDidHide', () => setOpen(false))
    return () => {
      shown.remove()
      hidden.remove()
    }
  }, [enabled])

  return open
}

/**
 * How far the footer has to rise to sit on the keyboard, on iOS.
 *
 * This is the only part of the shell that still avoids the keyboard by hand,
 * and it is a transform rather than padding for a reason worth keeping. The
 * whole shell used to be a `KeyboardAvoidingView` with `behavior="padding"`,
 * which shrinks the scroll view — and a scroll view that changes size fights
 * `automaticallyAdjustKeyboardInsets`, which is doing the same job from the
 * native side and doing it better. UIKit insets the scroll view and scrolls
 * the focused field up on the keyboard notification, measuring against a frame
 * the padding is about to change; the padding lands a beat later, the next
 * notification recomputes an inset of nothing, and the content it had scrolled
 * up gets clamped back down. Tapping a field scrolled up and then down again.
 *
 * Only the footer ever needed the padding. A transform moves it without
 * touching the frame anything else is measured against, so the native side is
 * left to do the whole job: it insets by the real overlap, in the keyboard's
 * own animation, and it only scrolls at all when the focused field is actually
 * under the keyboard.
 *
 * It rises by the keyboard's height LESS the home indicator's inset. That
 * padding is there to clear the indicator, and with a keyboard over it the
 * inset is a band of canvas between the buttons and the keys instead.
 */
function useKeyboardLift(enabled: boolean, inset: number) {
  const lift = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!enabled) return
    /* `willChangeFrame` rather than will-show and will-hide: one listener for
       the keyboard arriving, leaving, and changing height under a predictive
       bar or a hardware keyboard, and it carries the frame it is heading for
       along with the duration to get there. */
    const sub = Keyboard.addListener('keyboardWillChangeFrame', ({ endCoordinates, duration }) => {
      // Read fresh rather than closed over, so a rotation cannot leave this
      // measuring against the height the screen used to be.
      const windowHeight = Dimensions.get('window').height
      /* Clamped by the keyboard's own height as well as by zero. With the
         "prefer cross-fade transitions" accessibility setting on, iOS reports
         a `screenY` of 0 for a keyboard that is really at the bottom, and the
         subtraction alone would lift the footer the height of the screen. */
      const height = Math.min(
        Math.max(windowHeight - endCoordinates.screenY, 0),
        endCoordinates.height,
      )

      Animated.timing(lift, {
        toValue: -Math.max(height - inset, 0),
        // The keyboard's own duration, so the two move together.
        duration: duration > 10 ? duration : 10,
        // Its curve is private to UIKit and cannot be named from here; this is
        // the bezier it is commonly approximated with.
        easing: Easing.bezier(0.17, 0.59, 0.4, 0.77),
        useNativeDriver: true,
      }).start()
    })
    return () => sub.remove()
  }, [enabled, inset, lift])

  return lift
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
  /**
   * Extra points between the keyboard and the content, for the cases where
   * this view's frame does not start where it appears to.
   *
   * 0 is right under a navigator, which lays the screen out below the header
   * already. Pass `useHeaderHeight()` only if a header overlaps this view —
   * `insets.top` is never the right answer, and floats the footer a status bar
   * clear of the keyboard.
   *
   * Only reaches the shell's own keyboard avoidance, which is to say only a
   * screen with `scroll` off. A scrolling one is inset natively against the
   * real keyboard frame and has nothing to correct.
   */
  keyboardOffset?: number
  className?: string
  contentClassName?: string
}

/**
 * The screen shell: canvas background, safe-area insets, gutter, and keyboard
 * handling.
 *
 * Keyboard behaviour is the reason this exists rather than each screen wiring
 * its own ScrollView, and ONE THING OWNS IT PER PLATFORM:
 *
 * - iOS: `automaticallyAdjustKeyboardInsets`. UIKit insets the scroll view by
 *   the real keyboard frame and scrolls the focused field up only when the
 *   keyboard actually covers it, in the keyboard's own animation, and handles
 *   the hardware and floating iPad keyboards for free. Nothing else here may
 *   resize that scroll view while it is doing so — see `useKeyboardLift` for
 *   what a second mechanism cost.
 * - Android: `adjustResize`, which Expo sets by default. The window itself
 *   shrinks, so the footer is above the keyboard without anything being asked.
 *
 * The footer is the exception on both, and it moves without changing the
 * layout: a transform on iOS, and on Android only its bottom padding, which
 * the window resize has already made dead space.
 *
 * `KeyboardAvoidingView` is still the root, but it only does anything for a
 * screen that does NOT scroll — there is no scroll view to inset there, so
 * padding the shell is the only way a field in one stays visible.
 *
 * `keyboardShouldPersistTaps="handled"` is the third piece: it makes the first
 * tap on a button activate it instead of being eaten dismissing the keyboard.
 * Without it every form needs two taps to submit.
 */
export function Screen({
  children,
  footer,
  floating,
  flush = false,
  scroll = true,
  gestureScroll = false,
  keyboardOffset = 0,
  className,
  contentClassName,
  ...rest
}: ScreenProps) {
  const insets = useSafeAreaInsets()
  /* One of these does something and the other does not, per platform: iOS
     moves the footer itself, Android's window has already moved it and only
     the padding under it is left to correct.

     Not on a screen with nothing to scroll, where the shell below is padding
     the whole thing — including the footer — out of the keyboard's way. Lifted
     as well it would rise twice. */
  const lift = useKeyboardLift(Platform.OS === 'ios' && scroll, insets.bottom)
  const keyboardOpen = useKeyboardOpen(Platform.OS === 'android')
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
        paddingBottom: (flush ? 0 : spacing.gutter) + (footer ? 0 : insets.bottom),
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
    <KeyboardAvoidingView
      className={cn('flex-1 bg-canvas', className)}
      /* Only where there is no scroll view to do it better. On a scrolling
         screen this padding is what fought `automaticallyAdjustKeyboardInsets`
         and made a tapped field scroll up and then back down. */
      behavior={!scroll && Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardOffset}
    >
      {body}

      {/* Rides up with the footer, so a floating control is never left under an
          open keyboard.

          One gutter off this view's bottom and NO safe-area inset, which looks
          like an oversight and is the correction for one. A floating control's
          host is a tab screen, and `TabSlot` is a sibling of the nav bar rather
          than its parent: the slot's frame already stops where the bar begins,
          and the bar is what pads for the home indicator. Adding `insets.bottom`
          here counted it a second time and left the button floating a
          thumb-width too high.

          Styled rather than classed: the position is what makes this an overlay
          at all, and NativeWind's support for an `Animated.View` is not worth
          depending on for that. */}
      {floating ? (
        <Animated.View
          style={{
            position: 'absolute',
            right: spacing.gutter,
            bottom: spacing.gutter,
            alignItems: 'flex-end',
            transform: [{ translateY: lift }],
          }}
          pointerEvents="box-none"
        >
          {floating}
        </Animated.View>
      ) : null}

      {footer ? (
        /* The footer rises over the keyboard on a transform rather than by
           being pushed, so the scroll view above it keeps the frame UIKit is
           measuring the keyboard against. See `useKeyboardLift`. */
        <Animated.View style={{ transform: [{ translateY: lift }] }}>
          {/* No rule above the footer. The design separates it with space and
              the canvas colour alone, and a hairline under a full-width CTA
              reads as a seam rather than a divider. */}
          <View
            className="gap-md bg-canvas px-gutter pt-md"
            /* The home indicator's inset, unless the keyboard is over it — that
               padding is there to clear the indicator, and a keyboard leaves it
               as a band of canvas between the buttons and the keys. iOS takes
               the same amount off the lift instead, which changes no layout;
               this is the Android half, where the window resize has already
               moved the footer and only the padding is left. */
            style={{ paddingBottom: (keyboardOpen ? 0 : insets.bottom) + spacing.md }}
          >
            {footer}
          </View>
        </Animated.View>
      ) : null}
    </KeyboardAvoidingView>
  )
}
