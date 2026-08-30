import { cssInterop } from 'nativewind'
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import {
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { spacing } from '@/theme/tokens'
import { cn } from './cn'
import { NumpadHost, useNumpadZone } from './Numpad'
import { Text } from './Text'
import { ToastHost } from './Toast'

/**
 * The panel is a Pressable so a tap inside it can swallow the event before it
 * reaches the dismissing scrim, and animated so it can rise on its own while the
 * scrim stays exactly where it is.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * The body, taught `className`. NativeWind only converts it to a style for React
 * Native's own components, and a third-party one drops it silently, which loses
 * the panel's list the `flex-1` that gives it any height.
 */
const ScrollBody = cssInterop(KeyboardAwareScrollView, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
})

/** How long the panel takes to rise. */
const RISE_MS = 260
/** And to fall, once a drag has decided it is leaving. Quicker than it arrived. */
const FALL_MS = 180
/**
 * How far down the handle has to be dragged for the release to dismiss. Also
 * cleared by a flick, since a short fast drag and a long slow one mean the same
 * thing.
 */
const DISMISS_DISTANCE = 96
const DISMISS_VELOCITY = 900

/**
 * No `onShow` and no `onBack`: a surface without a window of its own is never
 * presented, and never takes a back press — the route hosting it does.
 */
export type SheetSurfaceProps = Omit<SheetProps, 'visible' | 'onShow' | 'onBack'> & {
  /**
   * Whether this surface should draw the app's toasts. See the outlet at the foot
   * of `SheetSurface`.
   *
   * `Sheet` passes its own `visible`, which is why the prop exists: on iOS a
   * `Modal` keeps its children mounted after `visible` goes false, so the outlet
   * inside a just-closed sheet is still the topmost claim and a toast fired in
   * the same handler is drawn inside a window on its way off screen. That is the
   * failure the outlet was added to fix, and "this needs Pro" fired from a
   * sheet's own button is the case that hits it.
   *
   * A route sheet has no window of its own and never passes it.
   */
  hosting?: boolean
}

export type SheetProps = {
  visible: boolean
  onClose: () => void
  /**
   * Android's hardware back, for a sheet with somewhere to go that is not closed:
   * the body it has drilled into. Absent, which is every sheet at its top level,
   * back dismisses. It is the move a `titleLeading` chevron makes, and it exists
   * because `Modal` hands the back press to `onRequestClose`, so a `BackHandler`
   * inside the window never sees it.
   */
  onBack?: () => void
  /**
   * The window is on screen. For a sheet that has to focus a field: `autoFocus`
   * inside a `Modal` is applied while the field is off screen and is routinely
   * dropped. Ignored by `SheetSurface`, which has no window of its own.
   */
  onShow?: () => void
  /**
   * What a screen reader calls the handle, which is a button as well as a drag
   * target. Defaulted rather than required, as `Stepper` defaults its two, or a
   * sheet that forgot it would announce nothing at all.
   */
  /** Screen-reader name for the drag handle. Pass translated copy. */
  closeLabel: string
  title?: string
  /**
   * One control on the title's own line, right aligned: a refresh, a close, a
   * filter. Beside the heading rather than in the `footer`, because these are
   * about the panel rather than what is in it, and a full-height sheet has no
   * footer to put them in.
   */
  titleAction?: ReactNode
  /**
   * One control on the other end of that line, left aligned: the way back up,
   * for a sheet whose body drills in. In the title row rather than at the top of
   * the body, because the body scrolls and a back control that scrolls away is
   * one somebody has to scroll back up to find.
   */
  titleLeading?: ReactNode
  /**
   * How many lines the title may take before it truncates. One where it names
   * the sheet, since those are short and fixed; two where the model named it, as
   * one line of "Nasi kandar ayam goreng berempah" identifies no dish. Same prop
   * and reason as `AppBar`'s.
   */
  titleLines?: 1 | 2
  description?: string
  /** Pinned below the scrollable body — the action row. */
  footer?: ReactNode
  /** Let the body scroll. Off for short, fixed content. */
  scrollable?: boolean
  /**
   * Sends the scrolling body back to its top whenever this changes, for a sheet
   * that swaps one body for another without closing: the scroll view is the same
   * instance either side, so a list read half way down opened what it drilled
   * into half way down too. A key rather than a remount, which would take the
   * incoming body's entrance animation with it.
   */
  scrollResetKey?: string | number
  /**
   * Grows the panel to the full height of the screen, less the status bar, for a
   * sheet whose content is a list worth scrolling: the 440pt cap shows four rows
   * and a keyboard. It stays a sheet, dismissed the same way.
   */
  fullHeight?: boolean
  // No `bodyClassName`. It capped the body of a sheet whose own field raises the
  // keyboard, and the cap was the wrong answer: a capped sheet is padded up off
  // the bottom edge, and the strip it leaves shows the scrim through the
  // keyboard's corners. Those sheets are `fullHeight` now.
  children?: ReactNode
  className?: string
}

/**
 * A bottom sheet.
 *
 * Built on the platform `Modal` rather than a portal inside the app tree, so it
 * renders above native pickers and the keyboard and Android's hardware back
 * closes it through `onRequestClose`.
 *
 * The scrim is a Pressable that closes and the panel is a Pressable that
 * swallows the press, or every tap inside would bubble to the scrim.
 *
 * A sheet with a text field rides above the keyboard itself: a `Modal` is its
 * own window, so the `Screen` shell's keyboard handling does not reach inside.
 */
export function Sheet({ visible, onShow, ...rest }: SheetProps) {
  return (
    /**
     * `animationType="none"`, not `"slide"`. The platform slide animates the
     * modal's whole root, scrim included, so the dim swept up from the bottom
     * edge and the top of the screen stayed undimmed for the transition. Now the
     * scrim paints at full strength on the first frame and only the panel
     * travels.
     */
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onShow={onShow}
      /* Up one level if there is one, and only then out. See `onBack`. */
      onRequestClose={rest.onBack ?? rest.onClose}
    >
      {/* A `Modal` is its own window, and on Android gesture-handler's root view
          does not reach into one — the app's root is outside it, so the handle's
          pan would simply never fire. A root of its own inside the window is what
          the library documents for exactly this case. Sheets that are ROUTES do
          not need it: they are in the app tree, under the root in `_layout`. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* The outlet follows the WINDOW, not the mount. See `hosting`. */}
        <SheetSurface {...rest} hosting={visible} />
      </GestureHandlerRootView>
    </Modal>
  )
}

/**
 * The sheet without a window of its own, for a route that is itself a sheet and
 * presented as a `transparentModal`. Those already have everything `Sheet`'s
 * `Modal` provides, and nesting a second window costs a visible delay: the route
 * transition has to finish before the inner `Modal` starts presenting.
 *
 * Use `Sheet` over an ordinary screen, where the window is what puts it above
 * the keyboard and native pickers.
 */
export function SheetSurface({
  hosting = true,
  onClose,
  closeLabel,
  title,
  titleAction,
  titleLeading,
  titleLines = 1,
  description,
  footer,
  scrollable = true,
  scrollResetKey,
  fullHeight = false,
  children,
  className,
}: SheetSurfaceProps) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()

  /**
   * The panel rises; the scrim does not.
   *
   * Driven by a shared value rather than reanimated's `entering`, because a
   * layout animation on a view that mounts with its window is routinely dropped
   * and the panel simply appeared. This starts from an explicit offscreen offset
   * and animates to zero in an effect, which always runs.
   *
   * Offset by the window height rather than the panel's own, which has not been
   * measured on the frame that has to start offscreen.
   */
  const rise = useSharedValue(height)

  // A LAYOUT effect, not a passive one: passive effects flush after the frame is
  // painted, so the first frame every sheet showed was the panel parked offscreen
  // with the animation not yet started. This runs in the same commit, so the panel is
  // already travelling on the frame it first appears.
  useLayoutEffect(() => {
    rise.value = withTiming(0, { duration: RISE_MS, easing: Easing.out(Easing.cubic) })
  }, [rise])

  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: rise.value }] }))

  /**
   * Drag the handle down to dismiss.
   *
   * On the handle rather than the whole panel: every sheet here has something
   * scrollable in it, and a pan on the panel either steals the first points of a
   * scroll or has to be taught to yield per child. The handle's only job is to be
   * grabbed.
   *
   * It moves the same shared value the entrance animation uses, so a drag picks
   * up where the rise left off.
   *
   * The close fires once, whatever asks: a tap, a drag past the threshold and a
   * press on the scrim can all arrive for one dismissal, and `onClose` unwinds a
   * navigator for a sheet that is a route. A ref rather than state, because it
   * must be true on the same tick. The scrim goes through here too, and it did
   * not, which is how a sheet closed twice with this guard in place.
   */
  const closing = useRef(false)
  /**
   * The same fact, on the UI thread, where the pan gesture can read it. A shared
   * value rather than the ref beside it, because a worklet reading a ref reads an
   * object it has frozen (see `Numpad`). It exists so nothing writes `rise` once
   * the panel is on its way out.
   */
  const falling = useSharedValue(false)

  const dismiss = useCallback(() => {
    if (closing.current) return
    closing.current = true
    falling.value = true
    rise.value = withTiming(
      height,
      { duration: FALL_MS, easing: Easing.in(Easing.cubic) },
      (finished) => {
        // After the panel is gone: `onClose` unmounts this, so calling it first
        // takes the surface off screen with no animation at all.
        //
        // Only when the animation ran to its end. Reanimated calls back a second
        // time when the animation is cancelled, which is what unmounting the
        // surface does to it, so written unconditionally one dismissal unwound
        // two screens.
        if (finished) runOnJS(onClose)()
      },
    )
  }, [rise, falling, height, onClose])

  const dragHandle = Gesture.Pan()
    .onUpdate((event) => {
      // Nothing moves the panel once it is leaving. See `falling`.
      if (falling.value) return
      // Downward only. Dragging up would lift the panel off the bottom of the
      // screen and show the scrim under it.
      rise.value = Math.max(0, event.translationY)
    })
    .onEnd((event) => {
      if (falling.value) return
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        runOnJS(dismiss)()
        return
      }
      // Back where it was. Same curve as the entrance, so a released drag reads
      // as the sheet settling rather than snapping.
      rise.value = withTiming(0, { duration: RISE_MS, easing: Easing.out(Easing.cubic) })
    })

  /**
   * The number pad, which a sheet accounts for itself: a `Sheet` is a native
   * modal window, so the pad a field inside it opens is drawn by the host below
   * rather than the one in `Screen`. The same two sums a screen does.
   */
  const numpad = useNumpadZone()
  const scroller = useRef<KeyboardAwareScrollViewRef>(null)
  const scrolled = useRef(0)
  const trackScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrolled.current = event.nativeEvent.contentOffset.y
  }, [])

  // A new body starts at its top, unanimated, since it is not on screen yet.
  // The early return is what a sheet that never swaps its body gets, and it
  // keeps the key an honest dependency. See `scrollResetKey`.
  useEffect(() => {
    if (scrollResetKey === undefined) return
    scroller.current?.scrollTo({ y: 0, animated: false })
    scrolled.current = 0
  }, [scrollResetKey])

  const revealForNumpad = useCallback(
    (measure: (report: (top: number, fieldHeight: number) => void) => void) => {
      measure((top, fieldHeight) => {
        const clear = height - numpad.height - spacing.md
        const overlap = top + fieldHeight - clear
        if (overlap > 1) {
          scroller.current?.scrollTo({ y: scrolled.current + overlap, animated: true })
        }
      })
    },
    [height, numpad.height],
  )

  const body = scrollable ? (
    <ScrollBody
      ref={scroller}
      onScroll={trackScroll}
      scrollEventThrottle={16}
      // Capped by default, and told to fill when the panel is full height —
      // without the second half the list keeps its 440pt and the panel grows a
      // field of empty surface under it.
      className={fullHeight ? 'flex-1' : 'max-h-[440px]'}
      contentContainerStyle={{ gap: spacing.md, paddingBottom: numpad.height }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      // How a full-height sheet gets out of the keyboard's way: the LIST insets
      // and reveals the focused field, rather than the panel shrinking. See the
      // note on the wrapper below. A capped sheet is padded up by that wrapper
      // instead, and insetting the list as well would count the keyboard twice.
      enabled={fullHeight}
      bottomOffset={spacing.md}
    >
      {children}
    </ScrollBody>
  ) : (
    <View className="gap-md">{children}</View>
  )

  return (
    /* The scrim is deliberately NOT an accessibility element. Giving it a role
       and a label makes the whole overlay one node, and VoiceOver then reads
       "Close button" and nothing else — the sheet's own title and buttons never
       reach the user. Dismissal stays available through the back gesture and
       `onRequestClose`. */
    <Pressable
      className="flex-1 justify-end bg-black/40"
      onPress={dismiss}
      accessible={false}
      importantForAccessibility="no"
    >
      {/* A host of its own, and this is why there is more than one. A sheet is a
          native modal WINDOW: nothing rendered in the app's tree below it can
          draw over it, so the pad a field in here opens has to be drawn in
          here. `NumpadHost` picks the nearest one above the field, which is
          this one whenever a sheet is up and `Screen`'s the rest of the time. */}
      <NumpadHost id={numpad.id} onOpen={revealForNumpad}>
        {/* Both platforms, now that `KeyboardProvider` reports the keyboard rather
          than Android's window resizing under us. It used to be iOS only, for
          exactly the reason that has gone away.

          A full-height sheet gets no behaviour at all. `padding` pads the
          panel's OUTSIDE, so the panel stopped where the keyboard began and the
          strip behind it — including the curve at the keyboard's top corners —
          showed the scrim rather than the sheet. A sheet that reaches the bottom
          of the screen has to keep reaching it; the scroll view above insets its
          own content instead, so the field stays above the keys and the surface
          runs the whole way down. */}
        <KeyboardAvoidingView
          behavior={fullHeight ? undefined : 'padding'}
          // Styled rather than classed: this is the one element here that is not
          // a plain RN view, and whether NativeWind reaches it is not worth
          // depending on for the layout that decides the panel's height.
          //
          // The margin keeps the scrim visible above a full-height panel, which
          // flush to the top edge reads as a screen from the wrong direction.
          style={fullHeight ? { flex: 1, marginTop: insets.top } : undefined}
        >
          <AnimatedPressable
            className={cn(
              'gap-md rounded-t-card bg-surface px-gutter pt-md',
              fullHeight && 'flex-1',
              className,
            )}
            /* The home indicator's inset OR the gutter, not both added together.
             Stacked, they left 54pt of blank surface under the last thing in the
             sheet — invisible under a full-width button, and an obvious band of
             nothing under anything else, like the picture picker's grid. The
             indicator's own inset already clears the indicator.

             Plus the number pad, on a CAPPED sheet only. `KeyboardAvoidingView`
             pads such a panel up off the bottom edge when a keyboard opens, and
             the pad is not a keyboard — without this the panel would sit under
             our own keys. At full height the list above insets instead, and
             adding it here as well would count the pad twice. */
            style={[
              panel,
              {
                paddingBottom:
                  Math.max(insets.bottom, spacing.gutter) + (fullHeight ? 0 : numpad.height),
              },
            ]}
            onPress={(event) => event.stopPropagation()}
            accessibilityViewIsModal
            accessible={false}
          >
            {/* The grab area is the row, not the 6pt line: a drag target has to be
              catchable without aiming, and the padding is what makes it 30pt tall
              without moving anything below it — `-mt-md` takes back the panel's
              own top padding, which the row then supplies itself.

              Announced as a button too, so the handle is not a gesture with no
              keyboard or screen-reader equivalent. Tapping it closes, which is
              what dragging it does. */}
            <GestureDetector gesture={dragHandle}>
              <Pressable
                className="-mt-md items-center py-md"
                onPress={dismiss}
                accessibilityRole="button"
                accessibilityLabel={closeLabel}
              >
                <View className="h-1.5 w-[54px] rounded-full bg-line" />
              </Pressable>
            </GestureDetector>

            {title ? (
              <View className="flex-row items-center justify-between gap-md">
                {titleLeading}
                <Text variant="subtitle" className="flex-1" numberOfLines={titleLines}>
                  {title}
                </Text>
                {titleAction}
              </View>
            ) : null}
            {description ? <Text variant="body">{description}</Text> : null}

            {children ? body : null}
            {footer}
          </AnimatedPressable>
        </KeyboardAvoidingView>
      </NumpadHost>

      {/* AND ITS OWN TOAST OUTLET, for the reason the numpad host above it
          exists: a sheet is a native window, and the toast the provider draws
          in the app's root view is underneath it. It mounted, ran its timer and
          dismissed itself behind the panel — so every message this sheet gives
          WITHOUT navigating away was invisible, which reads as a button that
          does nothing. Outside `NumpadHost` so the toast is not pushed up by a
          pad, and last so it draws over the panel. From the TOP, because the
          bottom of this screen is the panel and its buttons — see
          `ToastHostProps.placement`. Only while the window is actually up —
          see `hosting`, which is what stops a sheet that has just been closed
          from swallowing the toast explaining why. */}
      {hosting ? <ToastHost placement="top" /> : null}
    </Pressable>
  )
}
