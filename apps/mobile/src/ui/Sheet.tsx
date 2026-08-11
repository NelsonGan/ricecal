import { cssInterop } from 'nativewind'
import { type ReactNode, useCallback, useLayoutEffect, useRef } from 'react'
import { Modal, Pressable, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller'
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
import { Text } from './Text'

/**
 * The panel is a Pressable so a tap inside it can swallow the event before it
 * reaches the dismissing scrim, and animated so it can rise on its own while the
 * scrim stays exactly where it is.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * The body, taught `className` — NativeWind only converts it to a style for
 * React Native's own components, and a third-party one takes it as an ordinary
 * prop and drops it silently. Without this the panel's list loses the `flex-1`
 * that gives it any height at all.
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
 * How far down the handle has to be dragged for the release to dismiss.
 *
 * Also cleared by a flick: a fast downward release under this distance still
 * closes, because a short fast drag and a long slow one mean the same thing.
 */
const DISMISS_DISTANCE = 96
const DISMISS_VELOCITY = 900

/** No `onShow`: a surface without a window of its own is never presented. */
export type SheetSurfaceProps = Omit<SheetProps, 'visible' | 'onShow'>

export type SheetProps = {
  visible: boolean
  onClose: () => void
  /**
   * The window is on screen. For a sheet that has to focus a field: `autoFocus`
   * inside a `Modal` is applied while the field is still off screen and is
   * routinely dropped, so the keyboard never comes up. This fires once the
   * platform has actually presented the window, which is the moment a `focus()`
   * takes. Ignored by `SheetSurface`, which has no window of its own.
   */
  onShow?: () => void
  /**
   * What a screen reader calls the handle, which is a button as well as a drag
   * target. Defaulted rather than required, the same way `Stepper` defaults its
   * two — a sheet that forgot it would otherwise announce nothing at all.
   */
  closeLabel?: string
  title?: string
  description?: string
  /** Pinned below the scrollable body — the action row. */
  footer?: ReactNode
  /** Let the body scroll. Off for short, fixed content. */
  scrollable?: boolean
  /**
   * Grows the panel to the full height of the screen, less the status bar.
   *
   * For a sheet whose content is a list worth scrolling — search results — where
   * the 440pt cap shows four rows and a keyboard. It stays a sheet: same rise,
   * same scrim above it, dismissed the same way.
   */
  fullHeight?: boolean
  // No `bodyClassName`. It existed to cap the body of a sheet whose own field
  // raises the keyboard, which was the picture picker and nothing else — and the
  // cap was the wrong answer: a capped sheet is padded up off the bottom edge by
  // the keyboard, and the strip it leaves behind shows the scrim through the curve
  // of the keyboard's corners. Those sheets are `fullHeight` now, which keeps the
  // panel where it is and insets the list instead.
  children?: ReactNode
  className?: string
}

/**
 * A bottom sheet.
 *
 * Built on the platform `Modal` rather than a portal inside the app tree, so it
 * renders above native pickers and the keyboard, and so Android's hardware back
 * button closes it through `onRequestClose` without extra wiring.
 *
 * The scrim is a Pressable that closes; the panel is a Pressable that swallows
 * the press. Without the inner one, every tap inside the sheet would bubble to
 * the scrim and dismiss it.
 *
 * A sheet with a text field in it rides above the keyboard. A `Modal` is its
 * own window, so the `Screen` shell's keyboard handling does not reach inside
 * one: without this the keyboard covers a sheet anchored to the bottom, and
 * every result the user is typing to find is behind it.
 */
export function Sheet({ visible, onShow, ...rest }: SheetProps) {
  return (
    /**
     * `animationType="none"`, not `"slide"`.
     *
     * The platform slide animates the modal's whole root — scrim included — so
     * the dim swept up from the bottom edge with the panel, and for the length
     * of that transition the top of the screen was undimmed. It read as the
     * background sliding rather than a sheet rising over a background.
     *
     * The scrim now paints at full strength on the first frame, and only the
     * panel travels, which is what the design shows.
     */
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onShow={onShow}
      onRequestClose={rest.onClose}
    >
      {/* A `Modal` is its own window, and on Android gesture-handler's root view
          does not reach into one — the app's root is outside it, so the handle's
          pan would simply never fire. A root of its own inside the window is what
          the library documents for exactly this case. Sheets that are ROUTES do
          not need it: they are in the app tree, under the root in `_layout`. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SheetSurface {...rest} />
      </GestureHandlerRootView>
    </Modal>
  )
}

/**
 * The sheet without a window of its own.
 *
 * For a ROUTE that is itself a sheet — the quick selector, the voice sheet —
 * presented by the navigator as a `transparentModal`. Those already have
 * everything `Sheet`'s `Modal` provides, and nesting a second window inside them
 * costs a visible delay: the route transition has to finish before the inner
 * `Modal` starts presenting, and only then does the panel begin its 220ms slide.
 * Tapping the log button felt slow for exactly that reason.
 *
 * Use `Sheet` for a sheet opening over an ordinary screen. The window is what
 * puts it above the keyboard and above native pickers, and it is not optional
 * there.
 */
export function SheetSurface({
  onClose,
  closeLabel = 'Close',
  title,
  description,
  footer,
  scrollable = true,
  fullHeight = false,
  children,
  className,
}: SheetSurfaceProps) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()

  /**
   * The panel rises; the scrim does not.
   *
   * Driven by a shared value rather than by reanimated's `entering`, and that is
   * the whole point. A layout animation on a view that mounts with its window —
   * which is what `Sheet` does, since `Modal` is its own window — is routinely
   * dropped, so the panel simply appeared. This starts from an explicit offscreen
   * offset on the first frame and animates to zero in an effect, which runs after
   * mount and therefore always runs.
   *
   * Offset by the window height rather than by the panel's own: the panel has not
   * been measured on the frame that has to start offscreen, and a guess that is
   * too small shows a band of surface before the animation begins.
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
   * On the handle rather than on the whole panel, deliberately. Every sheet in
   * this app has something scrollable or draggable in it — a results list, an icon
   * grid, a slider — and a pan on the panel competes with all of them: it either
   * steals the first few points of a scroll or has to be taught to yield, and the
   * teaching is per-child. The handle is the one part of a sheet whose only job is
   * to be grabbed, and the gesture is scoped to it.
   *
   * It moves the same shared value the entrance animation uses, so a drag picks up
   * exactly where the rise left off and the two cannot fight.
   */
  /**
   * Once, whatever asks. A tap on the handle and a drag that lets go past the
   * threshold can both arrive, and `onClose` is `router.back()` for a sheet that
   * is a route — called twice it pops the screen UNDERNEATH, which on a tab bar is
   * a different tab. The ref rather than state because this must be true on the
   * same tick, not after a render.
   */
  const closing = useRef(false)

  const dismiss = useCallback(() => {
    if (closing.current) return
    closing.current = true
    rise.value = withTiming(height, { duration: FALL_MS, easing: Easing.in(Easing.cubic) }, () => {
      // After the panel is gone, not before: `onClose` unmounts this, and calling
      // it first would take the surface off screen with no animation at all.
      runOnJS(onClose)()
    })
  }, [rise, height, onClose])

  const dragHandle = Gesture.Pan()
    .onUpdate((event) => {
      // Downward only. Dragging up would lift the panel off the bottom of the
      // screen and show the scrim under it.
      rise.value = Math.max(0, event.translationY)
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        runOnJS(dismiss)()
        return
      }
      // Back where it was. Same curve as the entrance, so a released drag reads
      // as the sheet settling rather than snapping.
      rise.value = withTiming(0, { duration: RISE_MS, easing: Easing.out(Easing.cubic) })
    })

  const body = scrollable ? (
    <ScrollBody
      // Capped by default, and told to fill when the panel is full height —
      // without the second half the list keeps its 440pt and the panel grows a
      // field of empty surface under it.
      className={fullHeight ? 'flex-1' : 'max-h-[440px]'}
      contentContainerStyle={{ gap: spacing.md }}
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
      onPress={onClose}
      accessible={false}
      importantForAccessibility="no"
    >
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
        // Styled rather than classed, unlike everything else here: this is the one
        // element in the file that is not a plain RN view, and whether NativeWind
        // reaches it is not worth depending on for the layout that decides whether
        // the panel has any height at all.
        //
        // The margin keeps the scrim visible above a full-height panel. Flush to
        // the top edge it reads as a screen that arrived from the wrong direction.
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
             indicator's own inset already clears the indicator. */
          style={[panel, { paddingBottom: Math.max(insets.bottom, spacing.gutter) }]}
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

          {title ? <Text variant="subtitle">{title}</Text> : null}
          {description ? <Text variant="body">{description}</Text> : null}

          {children ? body : null}
          {footer}
        </AnimatedPressable>
      </KeyboardAvoidingView>
    </Pressable>
  )
}
