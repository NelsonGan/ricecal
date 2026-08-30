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
 * The scroll view, taught `className`. NativeWind converts it to a style only for
 * React Native's own components; a third-party one drops it with no warning, and
 * the scroll view below would lose its `flex-1`.
 */
const AwareScrollView = cssInterop(KeyboardAwareScrollView, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
})

/** Same treatment, for the shell that pads a NON-scrolling screen. */
const KeyboardShell = cssInterop(KeyboardAvoidingView, { className: 'style' })

/**
 * Gesture-handler's ScrollView, animated so it can stand in as the scroller
 * above: `KeyboardAwareScrollView` drives its insets through `animatedProps`,
 * which only a Reanimated component accepts.
 *
 * The cast is nominal: the slot is typed as an animated copy of React Native's
 * own ScrollView, which this cannot be, while all the library needs is that
 * `animatedProps` reaches a scroll view.
 */
const GestureScrollView = Reanimated.createAnimatedComponent(
  RawGestureScrollView,
) as unknown as KeyboardAwareScrollViewProps['ScrollViewComponent']

/**
 * How far above the footer a focused field is brought to rest: a gap plus the
 * parts of the field nobody measures.
 *
 * `KeyboardAwareScrollView` reveals the focused node, which is the `TextInput`
 * rather than the field. `TextField` centres a 22pt line inside a box at least
 * 60pt tall, so about 19pt of what the user sees sits below what the library
 * measures, and at a 14pt gap the field's bottom border sat on the footer.
 *
 * The third term is the line under the field: `TextField` renders its error or
 * hint outside the measured node, and `spacing.lg` is 22 against a `meta` line
 * box of 19.
 */
const FIELD_CLEARANCE = spacing.lg + spacing.md + spacing.lg

export type ScreenProps = Omit<ScrollViewProps, 'contentContainerStyle'> & {
  children: ReactNode
  /** Content pinned below the scroll area — the footer CTA. Never scrolls away. */
  footer?: ReactNode
  /**
   * Content laid over the scroll area, pinned to its bottom-right corner: the
   * floating action on Today. Unlike `footer`, which the content is laid out
   * above, this overlaps, so a screen using it owes its scroll content enough
   * bottom padding that the last row can be read.
   */
  floating?: ReactNode
  /**
   * The same overlay, pinned to the bottom left. Its own slot rather than a row
   * inside `floating`, because the two corners appear on different conditions and
   * a single row would need an invisible spacer for the absent half, which over a
   * scroll view eats taps.
   */
  floatingLeading?: ReactNode
  /** Drop the 20pt screen gutter, for content that bleeds to the edge. */
  flush?: boolean
  /** Render children in a plain View instead of a ScrollView. */
  scroll?: boolean
  /**
   * Scroll with gesture-handler's ScrollView instead of the platform one, for a
   * screen whose rows carry pan gestures. Swipe-to-delete needs it: inside the
   * platform ScrollView the pan never activates, because the two arbitrate
   * through different systems.
   *
   * Off by default; only Today renders a swipeable row.
   */
  gestureScroll?: boolean
  className?: string
  /**
   * Layout for the box the children sit in: `justify-center`, `items-center`.
   *
   * The content box in both modes. On the scrolling path this used to land on the
   * ScrollView's own `className`, where `justify-center` does nothing, since a
   * scroll view's alignment belongs to its content container.
   *
   * Passing it also makes the content box fill the viewport before it scrolls,
   * because centring inside a box as tall as its contents is a no-op. Only when
   * passed: a content container with a definite height changes what a `flex-1`
   * child does.
   */
  contentClassName?: string
}

/**
 * The screen shell: canvas background, safe-area insets, gutter, and keyboard
 * handling.
 *
 * Keyboard behaviour is why this exists rather than each screen wiring its own
 * ScrollView. `react-native-keyboard-controller` reports the keyboard's position
 * every frame on the UI thread, which none of React Native's own primitives can:
 *
 * - `KeyboardAwareScrollView` insets the scroll view and reveals the focused
 *   field, and takes a `bottomOffset`. UIKit's
 *   `automaticallyAdjustKeyboardInsets` always reveals a field to the keyboard's
 *   top and knows nothing about a footer sitting on it.
 * - `KeyboardStickyView` moves the footer on the UI thread, in the keyboard's own
 *   animation, replacing a `keyboardWillChangeFrame` listener driving a bezier
 *   approximation of UIKit's private curve.
 * - Android used `adjustResize` and corrected the footer's padding by hand off
 *   `keyboardDidShow`. `KeyboardProvider` takes the window edge-to-edge instead,
 *   so both platforms run the same code.
 *
 * `KeyboardAvoidingView` is still the root, but only does anything for a screen
 * that does not scroll.
 *
 * `keyboardShouldPersistTaps="handled"` makes the first tap on a button activate
 * it rather than being eaten dismissing the keyboard.
 */
export function Screen({
  children,
  footer,
  floating,
  floatingLeading,
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
   * Measured rather than guessed: it decides where a focused field comes to rest,
   * and the footer is a slot holding anything from one button to a button over a
   * caption.
   */
  const [footerHeight, setFooterHeight] = useState(0)
  const measureFooter = useCallback((event: LayoutChangeEvent) => {
    setFooterHeight(event.nativeEvent.layout.height)
  }, [])

  /**
   * How much room to keep between the focused field and the keyboard. The footer
   * rises to sit on the keyboard, so a field has to clear its height less the home
   * indicator's inset, which the lift already takes off, plus `FIELD_CLEARANCE`.
   */
  const bottomOffset = Math.max(footerHeight - insets.bottom, 0) + FIELD_CLEARANCE

  /**
   * How far the footer and the floating action ride up, tracked on the UI thread:
   * up by the keyboard, less the home indicator's inset, which would otherwise be
   * a band of canvas between the buttons and the keys.
   *
   * The clamp is why this is not `KeyboardStickyView`, which is the same
   * expression without one. Never downwards: a keyboard shorter than the bottom
   * inset makes the subtraction positive and pushes the footer off screen, which
   * a floating IME on Android does.
   *
   * Not on a screen with nothing to scroll, where the shell below already pads
   * the whole thing out of the way.
   */
  const keyboard = useReanimatedKeyboardAnimation()

  /**
   * The app's own number pad, which every numeric field opens instead of the
   * system keyboard. It is a view rather than a window, so nothing reports it and
   * this screen adds it to the same two sums the keyboard feeds. The two never
   * coincide, but they add rather than branch so there is one expression to read.
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
   * Bringing the focused field back above the pad, which
   * `KeyboardAwareScrollView` cannot do for a keyboard it is not told about.
   * Minimal rather than centred: a field already in view does not move, and one
   * that is not lands `bottomOffset` above whatever is covering it.
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
      className="flex-1"
      // The caller's alignment goes on the CONTENT CONTAINER, not here. See
      // `contentClassName`.
      contentContainerClassName={contentClassName}
      contentContainerStyle={{
        // Fills the viewport so `justify-center` has room to work, and grows
        // past it so taller content scrolls rather than hiding under the
        // footer. See `contentClassName` for why it is conditional.
        ...(contentClassName ? { flexGrow: 1 } : null),
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

        {/* The other corner, on the same lift and the same reasoning about the
            safe area. See `floatingLeading`. */}
        {floatingLeading ? (
          <Reanimated.View
            style={[
              {
                position: 'absolute',
                left: spacing.gutter,
                bottom: spacing.gutter,
                alignItems: 'flex-start',
              },
              lift,
            ]}
            pointerEvents="box-none"
          >
            {floatingLeading}
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
