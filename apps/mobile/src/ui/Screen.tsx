import { cssInterop } from 'nativewind'
import { type ReactNode, useCallback, useRef, useState } from 'react'
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  type ScrollViewProps,
  useWindowDimensions,
  View,
} from 'react-native'
import { ScrollView as RawGestureScrollView } from 'react-native-gesture-handler'
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
  type KeyboardAwareScrollViewRef,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller'
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { spacing } from '@/theme/tokens'
import { cn } from './cn'
import { NumpadHost, useNumpadZone } from './Numpad'

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

/**
 * How far above the footer a focused field is brought to rest.
 *
 * A GAP PLUS THE PART OF THE FIELD NOBODY MEASURES, and the second half is the
 * whole reason this is not simply `spacing.md`.
 *
 * `KeyboardAwareScrollView` reveals the focused NODE, and the focused node is
 * the `TextInput` — not the field. `TextField` centres a line of text about
 * 22pt tall inside a bordered box at least 60pt tall, so roughly 19pt of the
 * thing the user sees sits BELOW the thing the library measures, and the label
 * and any hint sit outside it entirely. At a 14pt gap that arithmetic left the
 * field's bottom border within a point or two of the footer's canvas: the
 * account screen's email field came to rest looking cropped, and whether it
 * actually was depended on the screen height, the home indicator's inset and
 * whichever keyboard the platform put up. "Slightly covered", and only
 * sometimes, which is the worst version of a layout bug to chase.
 *
 * So the clearance is the box first and the gap after it. Costing a scroll
 * position a few points higher is not a trade worth thinking about.
 */
const FIELD_CLEARANCE = spacing.lg + spacing.md

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
  const { height: windowHeight } = useWindowDimensions()

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
   * `FIELD_CLEARANCE`, for the reason written on it.
   */
  const bottomOffset = Math.max(footerHeight - insets.bottom, 0) + FIELD_CLEARANCE

  /**
   * How far the footer and the floating action ride up, tracked on the UI
   * thread. `height` runs from 0 to MINUS the keyboard's height, so this reads
   * as "up by the keyboard, less the home indicator's inset" — that padding is
   * there to clear the indicator, and with a keyboard over it the inset would
   * otherwise be a band of canvas between the buttons and the keys.
   *
   * The clamp is the whole reason this is not `KeyboardStickyView`, which is
   * the same expression without one. NEVER DOWNWARDS: a keyboard shorter than
   * the bottom inset makes the subtraction positive and pushes the footer off
   * the bottom of the screen. That is not hypothetical — a floating IME on
   * Android reports a height of almost nothing while still counting as open,
   * and the Android emulator sat in exactly that state with the sign-in button
   * hanging over the gesture bar.
   *
   * Not on a screen with nothing to scroll, where the shell below is padding
   * the whole thing — the footer included — out of the keyboard's way. Lifted
   * as well it would rise twice.
   */
  const keyboard = useReanimatedKeyboardAnimation()

  /**
   * The app's own number pad, which every numeric field opens instead of the
   * system keyboard. It is a view rather than a window, so nothing reports it
   * and this screen has to add it to the same two sums the keyboard feeds:
   * how far the footer rides up, and how much room the scroll view leaves at
   * the bottom. The two never coincide — a field is either numeric or it is
   * not — but they add rather than branch, so there is one expression to read.
   */
  const numpad = useNumpadZone()

  const lift = useAnimatedStyle(() => ({
    transform: [
      {
        // The keyboard's share is the scrolling screen's only — see above, the
        // shell pads for it otherwise. The PAD's share is always this view's,
        // on both, because the shell pads for a keyboard and the pad is not
        // one: without it, a footer on a screen that does not scroll would sit
        // under our own keys.
        translateY: Math.min(
          (scroll ? keyboard.height.value : 0) - numpad.offset.value + insets.bottom,
          0,
        ),
      },
    ],
  }))

  /**
   * Bringing the focused field back above the pad, which is the one job
   * `KeyboardAwareScrollView` did for us and cannot do for a keyboard it is not
   * told about. Minimal rather than centred: a field already in view does not
   * move at all, and one that is not comes to rest exactly where the library
   * would have put it — `bottomOffset` above whatever is covering it.
   */
  const scroller = useRef<KeyboardAwareScrollViewRef>(null)
  const scrolled = useRef(0)
  const trackScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrolled.current = event.nativeEvent.contentOffset.y
  }, [])

  const revealForNumpad = useCallback(
    (measure: (report: (top: number, height: number) => void) => void) => {
      measure((top, fieldHeight) => {
        const clear = windowHeight - numpad.height - bottomOffset
        const overlap = top + fieldHeight - clear
        if (overlap > 1)
          scroller.current?.scrollTo({ y: scrolled.current + overlap, animated: true })
      })
    },
    [windowHeight, numpad.height, bottomOffset],
  )

  const body = scroll ? (
    <AwareScrollView
      ref={scroller}
      className={cn('flex-1', contentClassName)}
      contentContainerStyle={{
        padding: flush ? 0 : spacing.gutter,
        // Every route draws its own title bar with `headerShown: false`, so the
        // status bar is this view's problem. Without the top inset the first
        // line of every screen sits under the clock.
        paddingTop: (flush ? 0 : spacing.gutter) + insets.top,
        // The pad's own share, so a field near the end of a screen has
        // somewhere to be scrolled TO. Without it the reveal asks for an offset
        // past the end of the content and the scroll view declines.
        paddingBottom: (flush ? 0 : spacing.gutter) + (footer ? 0 : insets.bottom) + numpad.height,
        gap: spacing.stack,
      }}
      bottomOffset={bottomOffset}
      // Only Today, and only because its rows are swipeable. See `gestureScroll`.
      ScrollViewComponent={gestureScroll ? GestureScrollView : undefined}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      showsVerticalScrollIndicator={false}
      {...rest}
      onScroll={(event) => {
        trackScroll(event)
        rest.onScroll?.(event)
      }}
      scrollEventThrottle={rest.scrollEventThrottle ?? 16}
      // What `keyboardDismissMode` does for the system keyboard, done by hand
      // for ours: a drag is somebody looking at the screen rather than typing
      // into it. Only a real drag, so the reveal's own animated scroll — which
      // fires no begin-drag — cannot close the pad it just made room for.
      onScrollBeginDrag={(event) => {
        numpad.dismiss?.()
        rest.onScrollBeginDrag?.(event)
      }}
    >
      {children}
    </AwareScrollView>
  ) : (
    <View
      className={cn('flex-1', !flush && 'p-gutter', contentClassName)}
      style={{
        gap: spacing.stack,
        paddingTop: (flush ? 0 : spacing.gutter) + insets.top,
        // No scroll view to inset, so the content box is what shrinks — the
        // same thing `behavior="padding"` does for the shell when a system
        // keyboard opens.
        paddingBottom: numpad.height,
      }}
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
      {/* Inside the shell rather than around it, so the pad it draws is
          absolutely positioned against a box that reaches the bottom of the
          window. Around it, the pad would be measured against whatever the
          screen's parent happens to be. */}
      <NumpadHost id={numpad.id} onOpen={revealForNumpad}>
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
          <Reanimated.View
            style={[
              {
                position: 'absolute',
                right: spacing.gutter,
                bottom: spacing.gutter,
                alignItems: 'flex-end',
              },
              lift,
            ]}
            pointerEvents="box-none"
          >
            {floating}
          </Reanimated.View>
        ) : null}

        {footer ? (
          /* A transform, so the scroll view above keeps the frame the keyboard is
           measured against and the footer's own height stays out of the layout
           pass entirely. See `lift` for how far it goes. */
          <Reanimated.View style={lift}>
            {/* No rule above the footer. The design separates it with space and
              the canvas colour alone, and a hairline under a full-width CTA
              reads as a seam rather than a divider. */}
            {/* On a device with a home indicator the inset is already a
                finger's worth of clearance, so the full `spacing.md` the top
                uses stacked on top of it reads as a band of dead canvas under
                the last button — most visible where the footer ends in a ghost
                button (the intro paywall's "Maybe later", the welcome screen's
                "I already have an account"), which floated a long way off the
                bottom edge. So `spacing.xs` on top of the inset there. The
                `max` is the floor for a device with NO inset (an older phone,
                most Android gesture-off bars): the CTA still wants `spacing.md`
                of real gap under it, which is what the old value always gave. */}
            <View
              onLayout={measureFooter}
              className="gap-md bg-canvas px-gutter pt-md"
              style={{ paddingBottom: Math.max(insets.bottom + spacing.xs, spacing.md) }}
            >
              {footer}
            </View>

            {/* Canvas continuing below the footer, all the way down the screen.

              The footer is a fixed-height block moved up by however much the
              keyboard says it occupies, so anything the keyboard occupies but
              does not COVER is a band of diary showing between the buttons and
              the keys. iOS 26's number pad is where that stopped being
              theoretical: the "Done" pill it floats above the keys is inside
              the frame the app is told about while the keys are not, so the
              footer cleared a control it could not see and left a strip of the
              entry on show underneath it.

              The pad is the app's own now, and its height is a constant this
              app owns, so that particular gap is gone at the source. This stays
              for every other keyboard, where the frame is still somebody else's
              to report: a floating IME on Android, an autofill panel, whatever
              a platform decides to attach next. Skirting rather than capping,
              because a frame taller than its keys is usually taller for a
              reason and covering the difference puts our buttons under
              somebody else's.

              Absolute, so it stays out of the layout the footer is measured
              by — `bottomOffset` is that measurement, and a skirt inside it
              would push every focused field a screen height up. Off the bottom
              of the screen whenever nothing is open, so it costs a view and
              nothing else. */}
            <View
              pointerEvents="none"
              className="absolute inset-x-0 bg-canvas"
              style={{ top: '100%', height: windowHeight }}
            />
          </Reanimated.View>
        ) : null}
      </NumpadHost>
    </KeyboardShell>
  )
}
