import { cssInterop } from 'nativewind'
import { type ReactNode, useCallback, useState } from 'react'
import { type LayoutChangeEvent, Platform, type ScrollViewProps, View } from 'react-native'
import { ScrollView as RawGestureScrollView } from 'react-native-gesture-handler'
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
  KeyboardStickyView,
} from 'react-native-keyboard-controller'
import Reanimated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { spacing } from '@/theme/tokens'
import { cn } from './cn'

/**
 * The scroll view, taught `className`.
 *
 * NativeWind converts className to style for the components it ships support
 * for, which are React Native's own. A third-party component takes `className`
 * as an ordinary prop and drops it — no warning, no error, an element with
 * none of the styling it was asked for. Without this registration the scroll
 * view below loses its `flex-1`.
 */
const AwareScrollView = cssInterop(KeyboardAwareScrollView, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
})

/** Same treatment, for the shell that pads a NON-scrolling screen. */
const KeyboardShell = cssInterop(KeyboardAvoidingView, { className: 'style' })

/**
 * Gesture-handler's ScrollView, animated so it can stand in as the scroller
 * above. `KeyboardAwareScrollView` drives its inner view's insets through
 * `animatedProps`, which only a Reanimated component accepts — a plain one
 * would take the whole keyboard mechanism as inert props and drop it.
 *
 * The cast is nominal rather than structural: the slot is typed as an animated
 * copy of React Native's OWN ScrollView, which this is not and cannot be, while
 * the only thing the library actually needs from it is that `animatedProps`
 * reaches a scroll view. Gesture-handler's takes the same props.
 */
const GestureScrollView = Reanimated.createAnimatedComponent(
  RawGestureScrollView,
) as unknown as KeyboardAwareScrollViewProps['ScrollViewComponent']

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
 * its own ScrollView, and ONE LIBRARY OWNS IT ON BOTH PLATFORMS.
 * `react-native-keyboard-controller` reports the keyboard's position every
 * frame on the UI thread, which is the thing none of React Native's own
 * primitives can do:
 *
 * - `KeyboardAwareScrollView` insets the scroll view and reveals the focused
 *   field, and it takes a `bottomOffset` — the one number the platform cannot
 *   be told. UIKit's `automaticallyAdjustKeyboardInsets` always reveals a field
 *   to the KEYBOARD'S top, and knows nothing about a footer sitting on the
 *   keyboard: tapping the fat figure on a logged entry scrolled it neatly to
 *   the top of the keys and left it behind the Save button, so the number being
 *   typed was the one thing on screen the user could not see.
 * - `KeyboardStickyView` moves the footer, on the UI thread, in the keyboard's
 *   own animation. What it replaces was a `keyboardWillChangeFrame` listener
 *   driving an `Animated.timing` over a bezier approximating UIKit's private
 *   curve — close, but visibly not the same motion, and no help at all during
 *   an interactive dismissal, where no JS event fires while the finger drags
 *   the keyboard down and the footer simply hung in the air until it let go.
 * - Android used to be a different mechanism entirely: `adjustResize` shrank
 *   the window, and the footer's dead bottom padding was corrected by hand off
 *   `keyboardDidShow`. `KeyboardProvider` takes the window edge-to-edge and
 *   reports the keyboard instead, so both platforms now run the code above and
 *   there is one behaviour to reason about rather than two.
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
  className,
  contentClassName,
  ...rest
}: ScreenProps) {
  const insets = useSafeAreaInsets()

  /**
   * Measured rather than guessed, because it is the number that decides where a
   * focused field comes to rest and the footer is a slot: one button on the
   * paywall, two side by side on a logged entry, a button over a caption in
   * onboarding.
   */
  const [footerHeight, setFooterHeight] = useState(0)
  const measureFooter = useCallback((event: LayoutChangeEvent) => {
    setFooterHeight(event.nativeEvent.layout.height)
  }, [])

  /**
   * How much room to keep between the focused field and the keyboard.
   *
   * The footer rises to sit on the keyboard, so the part of it standing ABOVE
   * the keys is what a field has to clear — its height less the home
   * indicator's inset, which the lift already takes off (see the footer). Plus
   * a gap, so the field is not flush against the buttons.
   */
  const bottomOffset = Math.max(footerHeight - insets.bottom, 0) + spacing.md

  const body = scroll ? (
    <AwareScrollView
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
      bottomOffset={bottomOffset}
      // Only Today, and only because its rows are swipeable. See `gestureScroll`.
      ScrollViewComponent={gestureScroll ? GestureScrollView : undefined}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      showsVerticalScrollIndicator={false}
      {...rest}
    >
      {children}
    </AwareScrollView>
  ) : (
    <View
      className={cn('flex-1', !flush && 'p-gutter', contentClassName)}
      style={{ gap: spacing.stack, paddingTop: (flush ? 0 : spacing.gutter) + insets.top }}
    >
      {children}
    </View>
  )

  return (
    <KeyboardShell
      className={cn('flex-1 bg-canvas', className)}
      /* Only where there is no scroll view to do it better. On a scrolling
         screen this padding would shrink the frame the scroller is measuring
         the keyboard against, and two things insetting for one keyboard is how
         a tapped field ends up scrolled up and then straight back down. */
      behavior={!scroll ? 'padding' : undefined}
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
          at all, and NativeWind's support for a third-party animated view is
          not worth depending on for that. */}
      {floating ? (
        <KeyboardStickyView
          // Nothing moves the shell on a scrolling screen, so the sticky view is
          // the only thing that can. On a non-scrolling one the padding above
          // has already carried this up and a lift would count the keyboard
          // twice.
          enabled={scroll}
          offset={{ closed: 0, opened: insets.bottom }}
          style={{
            position: 'absolute',
            right: spacing.gutter,
            bottom: spacing.gutter,
            alignItems: 'flex-end',
          }}
          pointerEvents="box-none"
        >
          {floating}
        </KeyboardStickyView>
      ) : null}

      {footer ? (
        /* The footer rises by the keyboard's height LESS the home indicator's
           inset, which is what `offset.opened` adds back. That padding is there
           to clear the indicator, and with a keyboard over it the inset would
           otherwise be a band of canvas between the buttons and the keys.

           A transform, so the scroll view above keeps the frame the keyboard is
           measured against and the footer's own height stays out of the layout
           pass entirely. */
        <KeyboardStickyView enabled={scroll} offset={{ closed: 0, opened: insets.bottom }}>
          {/* No rule above the footer. The design separates it with space and
              the canvas colour alone, and a hairline under a full-width CTA
              reads as a seam rather than a divider. */}
          <View
            onLayout={measureFooter}
            className="gap-md bg-canvas px-gutter pt-md"
            style={{ paddingBottom: insets.bottom + spacing.md }}
          >
            {footer}
          </View>
        </KeyboardStickyView>
      ) : null}
    </KeyboardShell>
  )
}
