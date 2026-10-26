import { cssInterop } from 'nativewind'
import { type ReactNode, useCallback, useRef, useState } from 'react'
import {
  type LayoutChangeEvent,
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
import Reanimated, {
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { spacing } from '@/theme/tokens'
import { splitPanes } from './Aside'
import { PaneWidthProvider, paneFrames, useWindowLayout } from './adaptive'
import { useNavInset } from './BottomNav'
import { cn } from './cn'
import { NumpadHost, useNumpadZone } from './Numpad'
import { ToastHost } from './Toast'

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

/** Extra room kept between a non-scrolling screen's footer and the keyboard. */
const KEYBOARD_GAP = 6

/**
 * How much of the keyboard a riding footer (`keyboardAvoid="footer"`) does not
 * rise by: the home indicator's inset, which the keys cover, less the gap it
 * keeps off them. A chat list under that footer is offset by this so the two
 * move together.
 */
export function footerKeyboardOffset(bottomInset: number): number {
  return Math.max(bottomInset - KEYBOARD_GAP, 0)
}

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

/** The canvas left between two flush panes at the fold. */
const FOLD_SEAM = 12

/** A floating trailing control's height and the gap above it: the add button's. */
const FLOATING_CLEARANCE = 62 + spacing.gutter

export type ScreenProps = Omit<ScrollViewProps, 'contentContainerStyle'> & {
  /**
   * The page. Wrap the part that can stand beside the rest in `<Aside>`, and on
   * a window with room for two panes it becomes the second pane, scrolling on
   * its own. On a phone the markers do nothing.
   * Only `Screen`'s own children count, looking through fragments and arrays.
   */
  children: ReactNode
  /**
   * Page chrome pinned above the scroll area. Pass an `AppBar` here on every
   * pushed page so its way out and its title remain reachable while the body
   * moves. The shell owns the safe-area inset and the usual screen gutter for
   * it, leaving callers to describe only the bar itself.
   */
  header?: ReactNode
  /**
   * Header chrome layered over the scroll area instead of taking layout space.
   * Reserved for a full-bleed hero whose image is the header background; the
   * node owns its own absolute positioning and transition.
   */
  overlayHeader?: ReactNode
  /**
   * A scroll position consumed on Reanimated's UI thread. Use this for chrome
   * whose appearance follows the page, so a busy JavaScript frame cannot make
   * the transition lag behind the content under somebody's finger.
   */
  scrollOffset?: SharedValue<number>
  /** Content pinned below the scroll area — the footer CTA. Never scrolls away. */
  footer?: ReactNode
  /**
   * Content laid over the scroll area, pinned to its bottom-left corner, and
   * above the floating nav bar on a tab. Unlike `footer`, which the content is
   * laid out above, this overlaps, so a screen using it owes its scroll content
   * enough bottom padding that the last row can be read.
   */
  floatingLeading?: ReactNode
  /**
   * The same in the bottom-right corner: Today's add button. The content is
   * padded by the button's height, so the last row of the day can be scrolled
   * clear of it rather than sitting under it, which is what moved the button
   * into the tab bar the first time it floated here.
   */
  floatingTrailing?: ReactNode
  /**
   * Draw toasts above `floatingTrailing` instead of across it. A toast sat on
   * Today's add button, and the first one a new account sees, the tour offer,
   * stays up for twelve seconds.
   *
   * Pass whether the screen is focused. A tab screen stays mounted behind the
   * others, and a host it held would draw their toasts where nobody can see them.
   *
   * The host and the room under the last row stay while the button is hidden
   * (Today hides it behind a swiped-open row): tied to the button, "Removed"
   * appeared, then jumped up as the deleted row closed and the host came back.
   */
  toastsAboveFloating?: boolean
  /** Drop the 20pt screen gutter, for content that bleeds to the edge. */
  flush?: boolean
  /**
   * Whether this shell owns the top safe-area inset.
   *
   * Disable only when a fixed header above the shell already pads itself for
   * the inset. Otherwise the content starts with two status-bar clearances.
   */
  safeAreaTop?: boolean
  /** Render children in a plain View instead of a ScrollView. */
  scroll?: boolean
  /**
   * How a screen that does not scroll makes way for the keyboard. A scrolling
   * screen ignores it.
   *
   * - `padding`, the default: the whole shell shrinks by the keyboard.
   * - `footer`: only the footer moves, as a transform in the keyboard's own
   *   animation, and the body insets itself (a chat's `KeyboardChatScrollView`,
   *   offset by `footerKeyboardOffset`). Padding is a layout pass every
   *   frame, and in a chat the composer visibly trailed the keys.
   * - `none`: nothing moves. For a screen whose fields all live in sheets: a tab
   *   stays mounted under the screens pushed over it, and padding for their
   *   keyboard slid its floating bar up behind them, then down again on the way
   *   back.
   */
  keyboardAvoid?: 'padding' | 'footer' | 'none'
  /**
   * Scroll with gesture-handler's ScrollView instead of the platform one, for a
   * screen whose rows carry pan gestures. Swipe-to-delete needs it: inside the
   * platform ScrollView the pan never activates, because the two arbitrate
   * through different systems.
   *
   * Off by default; on for Today and the workout editors, whose rows swipe.
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
  header,
  overlayHeader,
  scrollOffset,
  footer,
  floatingLeading,
  floatingTrailing,
  toastsAboveFloating = false,
  flush = false,
  safeAreaTop = true,
  scroll = true,
  keyboardAvoid = 'padding',
  gestureScroll = false,
  className,
  contentClassName,
  ...rest
}: ScreenProps) {
  const insets = useSafeAreaInsets()
  // A tab screen's bottom is under the floating nav bar. Zero everywhere else.
  const navInset = useNavInset()
  const layout = useWindowLayout()
  const panes = layout.split ? splitPanes(children) : null
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
   * How far the footer and the floating control ride up, tracked on the UI thread:
   * up by the keyboard, less the home indicator's inset, which would otherwise be
   * a band of canvas between the buttons and the keys.
   *
   * The clamp is why this is not `KeyboardStickyView`, which is the same
   * expression without one. Never downwards: a keyboard shorter than the bottom
   * inset makes the subtraction positive and pushes the footer off screen, which
   * a floating IME on Android does.
   *
   * Not on a screen with nothing to scroll, where the shell below already pads
   * the whole thing out of the way, unless it asks for the footer to ride.
   */
  const keyboard = useReanimatedKeyboardAnimation()

  /**
   * The app's own number pad, which every numeric field opens instead of the
   * system keyboard. It is a view rather than a window, so nothing reports it and
   * this screen adds it to the same two sums the keyboard feeds. The two never
   * coincide, but they add rather than branch so there is one expression to read.
   */
  const numpad = useNumpadZone()

  const footerRides = !scroll && keyboardAvoid === 'footer'
  const shellPads = !scroll && keyboardAvoid === 'padding'

  const lift = useAnimatedStyle(() => ({
    transform: [
      {
        // The keyboard's share is the scrolling screen's, and the riding
        // footer's (`keyboardAvoid`), which keeps the same few points off the
        // keys the padded shell gives it; the shell pads for it otherwise. The
        // PAD's share is always this view's, on both, because the shell pads
        // for a keyboard and the pad is not one: without it, a footer on a
        // screen that does not scroll would sit under our own keys.
        translateY: Math.min(
          (scroll
            ? keyboard.height.value
            : footerRides
              ? keyboard.height.value -
                Math.min(KEYBOARD_GAP, insets.bottom) * keyboard.progress.value
              : 0) -
            numpad.offset.value +
            insets.bottom,
          0,
        ),
      },
    ],
  }))

  /**
   * The footer's bottom padding. On a screen that does not scroll the shell
   * pads the keyboard's full height, which already covers the home indicator,
   * so the footer's inset padding became a band of canvas between a composer
   * and the keys. It gives that inset back as the keyboard rises, less a few
   * points so the field does not touch the keys. Padding rather than a slide
   * down: a transform left the same band empty above the footer instead.
   */
  const restPad = Math.max(insets.bottom + spacing.xs, spacing.md)
  const footerPad = useAnimatedStyle(() => ({
    paddingBottom: !shellPads
      ? restPad
      : restPad - Math.max(insets.bottom - KEYBOARD_GAP, 0) * keyboard.progress.value,
  }))

  /**
   * Bringing the focused field back above the pad, which
   * `KeyboardAwareScrollView` cannot do for a keyboard it is not told about.
   * Minimal rather than centred: a field already in view does not move, and one
   * that is not lands `bottomOffset` above whatever is covering it.
   */
  const scroller = useRef<KeyboardAwareScrollViewRef>(null)
  const scrolled = useSharedValue(0)
  const trackAnimatedScroll = useAnimatedScrollHandler((event) => {
    scrolled.value = event.contentOffset.y
    if (scrollOffset) scrollOffset.value = event.contentOffset.y
  })
  // The second pane's own, for a field in an `Aside`. See `revealForNumpad`.
  const asideScroller = useRef<KeyboardAwareScrollViewRef>(null)
  const asideScrolled = useSharedValue(0)
  const trackAsideScroll = useAnimatedScrollHandler((event) => {
    asideScrolled.value = event.contentOffset.y
  })

  /** Where the panes sit across the window. Null for the second on a phone. */
  const frames = paneFrames(layout)
  const asideFrame = panes ? frames.aside : null
  // A number rather than the frame, which is a new object every render: the
  // pad's host reruns its reveal whenever `revealForNumpad` changes.
  const asideLeft = asideFrame?.left

  const revealForNumpad = useCallback(
    (measure: (report: (top: number, height: number, left: number) => void) => void) => {
      measure((top, fieldHeight, left) => {
        const clear = windowHeight - numpad.height - bottomOffset
        const overlap = top + fieldHeight - clear
        if (overlap <= 1) return
        // The pane the field is in is the one to scroll: with two, a field
        // right of the fold is in the `Aside`.
        const inAside = asideLeft !== undefined && left >= asideLeft
        const [view, offset] = inAside ? [asideScroller, asideScrolled] : [scroller, scrolled]
        view.current?.scrollTo({ y: offset.value + overlap, animated: true })
      })
    },
    [windowHeight, numpad.height, bottomOffset, scrolled, asideScrolled, asideLeft],
  )

  /**
   * The content box, once per pane. The caller's scroll props belong to the
   * first pane. A second pane only exists on a window with room for two, and
   * holds the page's `Aside`.
   */
  const renderBody = (content: ReactNode, primary: boolean) =>
    scroll ? (
      <AwareScrollView
        ref={primary ? scroller : asideScroller}
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
          // A pinned header owns both of these above the scroll view. Keeping
          // them here as well would leave a second blank header-height band
          // before the first card.
          paddingTop: header ? 0 : (flush ? 0 : spacing.gutter) + (safeAreaTop ? insets.top : 0),
          // The pad's own share, so a field near the end of a screen has
          // somewhere to be scrolled TO. Without it the reveal asks for an offset
          // past the end of the content and the scroll view declines.
          paddingBottom:
            (flush ? 0 : spacing.gutter) +
            // With two panes the footer stands under the second only.
            (footer && !(primary && asideFrame) ? 0 : navInset || insets.bottom) +
            (floatingTrailing || toastsAboveFloating ? FLOATING_CLEARANCE : 0) +
            numpad.height,
          gap: spacing.stack,
        }}
        bottomOffset={bottomOffset}
        // Only where rows swipe. See `gestureScroll`.
        ScrollViewComponent={gestureScroll ? GestureScrollView : undefined}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        {...(primary ? rest : null)}
        onScroll={
          primary && rest.onScroll
            ? (event) => {
                // `onScroll` remains a normal React Native escape hatch. The
                // dedicated `scrollOffset` path above is what visual work uses,
                // because it never crosses to the JavaScript thread.
                scrolled.value = event.nativeEvent.contentOffset.y
                if (scrollOffset) scrollOffset.value = event.nativeEvent.contentOffset.y
                rest.onScroll?.(event)
              }
            : primary
              ? trackAnimatedScroll
              : trackAsideScroll
        }
        scrollEventThrottle={rest.scrollEventThrottle ?? 16}
        // What `keyboardDismissMode` does for the system keyboard, done by hand
        // for ours: a drag is somebody looking at the screen rather than typing
        // into it. Only a real drag, so the reveal's own animated scroll — which
        // fires no begin-drag — cannot close the pad it just made room for.
        onScrollBeginDrag={(event) => {
          numpad.dismiss?.()
          if (primary) rest.onScrollBeginDrag?.(event)
        }}
      >
        {content}
      </AwareScrollView>
    ) : (
      <View
        className={cn('flex-1', !flush && 'p-gutter', contentClassName)}
        style={{
          gap: spacing.stack,
          paddingTop: header ? 0 : (flush ? 0 : spacing.gutter) + (safeAreaTop ? insets.top : 0),
          // No scroll view to inset, so the content box is what shrinks — the
          // same thing `behavior="padding"` does for the shell when a system
          // keyboard opens.
          // Not the nav bar's inset: a list in here pads itself so it can scroll
          // on under the floating bar. See `useNavInset`.
          paddingBottom: numpad.height,
        }}
      >
        {content}
      </View>
    )

  /**
   * The footer CTA. Under the page, or with two panes under the second, beside
   * the content it acts on rather than lying across the fold.
   */
  const footerBlock = footer ? (
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
      {/* Measured only where it is read (`bottomOffset`, scrolling screens).
         Elsewhere the padding animates with the keyboard, and measuring
         it re-rendered the whole screen on every frame. */}
      <Reanimated.View
        onLayout={scroll ? measureFooter : undefined}
        className="gap-md bg-canvas px-gutter pt-md"
        style={footerPad}
      >
        {footer}
      </Reanimated.View>

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
  ) : null

  /**
   * Two panes side by side, meeting at the fold. See `adaptive.ts`; on a phone
   * `panes` is null and this is the one content box it always was.
   */
  // A gutter's worth of canvas already separates two padded panes at the fold.
  // Flush ones would run edge to edge into each other, two rows reading as
  // one, so each gives up half of a narrow seam.
  const seam = flush ? FOLD_SEAM / 2 : 0
  const body =
    panes && asideFrame ? (
      <View className="flex-1 flex-row">
        <View style={{ width: frames.main.width, paddingRight: seam }}>
          <PaneWidthProvider value={frames.main.width - seam}>
            {renderBody(panes.main, true)}
          </PaneWidthProvider>
        </View>
        <View style={{ width: asideFrame.width, paddingLeft: seam }}>
          <PaneWidthProvider value={asideFrame.width - seam}>
            {renderBody(panes.aside, false)}
          </PaneWidthProvider>
          {footerBlock}
        </View>
      </View>
    ) : (
      renderBody(children, true)
    )

  /**
   * A floating control in a bottom corner. Rides up with the footer, so it is
   * never left under an open keyboard, and sits one gutter above the floating
   * nav bar, whose footprint already includes the home indicator, so the safe
   * area is not added again.
   *
   * Styled rather than classed: the position is what makes this an overlay at
   * all, and NativeWind's support for a third-party animated view is not worth
   * depending on for that.
   */
  const corner = (side: 'left' | 'right', control: ReactNode) =>
    control ? (
      <Reanimated.View
        style={[
          {
            position: 'absolute',
            ...(side === 'left' ? { left: spacing.gutter } : { right: spacing.gutter }),
            bottom: spacing.gutter + navInset,
            alignItems: side === 'left' ? 'flex-start' : 'flex-end',
          },
          lift,
        ]}
        pointerEvents="box-none"
      >
        {control}
      </Reanimated.View>
    ) : null

  return (
    <KeyboardShell
      className={cn('flex-1 bg-canvas', className)}
      /* Only where there is no scroll view to do it better. On a scrolling
         screen this padding would shrink the frame the scroller is measuring
         the keyboard against, and two things insetting for one keyboard is how
         a tapped field ends up scrolled up and then straight back down. */
      behavior={shellPads ? 'padding' : undefined}
    >
      {/* Inside the shell rather than around it, so the pad it draws is
          absolutely positioned against a box that reaches the bottom of the
          window. Around it, the pad would be measured against whatever the
          screen's parent happens to be. */}
      <NumpadHost id={numpad.id} onOpen={revealForNumpad}>
        {/* Inside the side insets, which are zero on every iPhone but iPhone
            Duo, where iOS keeps a column down one edge for the clock and the
            camera. The canvas still runs under it; only the page stops short.
            Everything absolutely placed below, the corners and the toasts,
            measures from this box, so they move in with it. */}
        <View className="flex-1" style={{ marginLeft: layout.left, marginRight: layout.right }}>
          {header ? (
            /* Outside `body`, so neither a drag nor keyboard-driven reveal can
             move the page's way out. The bottom padding is the same stack gap
             that separated an in-content AppBar from the first card before
             headers became sticky. */
            <View
              className="z-10 bg-canvas px-gutter pb-stack"
              style={{ paddingTop: (safeAreaTop ? insets.top : 0) + spacing.gutter }}
            >
              {header}
            </View>
          ) : null}

          {body}

          {overlayHeader}

          {corner('right', floatingTrailing)}

          {corner('left', floatingLeading)}

          {asideFrame ? null : footerBlock}
        </View>

        {toastsAboveFloating ? (
          // The provider already clears the safe area, so it comes off here.
          // Outside the inset box above, like every other toast outlet: a toast
          // places itself against the window. See `overlayInsets`.
          <ToastHost offset={FLOATING_CLEARANCE + navInset - insets.bottom} />
        ) : null}
      </NumpadHost>
    </KeyboardShell>
  )
}
