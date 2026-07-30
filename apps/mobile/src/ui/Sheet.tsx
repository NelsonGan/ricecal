import { type ReactNode, useEffect } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, {
  Easing,
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

/** How long the panel takes to rise. */
const RISE_MS = 260

export type SheetSurfaceProps = Omit<SheetProps, 'visible'>

export type SheetProps = {
  visible: boolean
  onClose: () => void
  title?: string
  description?: string
  /** Pinned below the scrollable body — the action row. */
  footer?: ReactNode
  /** Let the body scroll. Off for short, fixed content. */
  scrollable?: boolean
  /**
   * The scrollable body's box. Its only real use is capping the height on a
   * sheet whose own field raises the keyboard — 440pt of content plus a
   * keyboard is taller than a phone, and the overflow comes off the top, where
   * the field the user is typing into lives.
   */
  bodyClassName?: string
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
export function Sheet({ visible, ...rest }: SheetProps) {
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
    <Modal visible={visible} transparent animationType="none" onRequestClose={rest.onClose}>
      <SheetSurface {...rest} />
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
  title,
  description,
  footer,
  scrollable = true,
  bodyClassName,
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

  useEffect(() => {
    rise.value = withTiming(0, { duration: RISE_MS, easing: Easing.out(Easing.cubic) })
  }, [rise])

  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: rise.value }] }))

  const body = scrollable ? (
    <ScrollView
      className={cn('max-h-[440px]', bodyClassName)}
      contentContainerStyle={{ gap: spacing.md }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
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
      {/* Android is left on `undefined`: `adjustResize` already shrinks the
          window, and stacking both double-counts the inset — the same
          reasoning as in `Screen`. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <AnimatedPressable
          className={cn('gap-md rounded-t-card bg-surface px-gutter pt-md', className)}
          style={[panel, { paddingBottom: insets.bottom + spacing.gutter }]}
          onPress={(event) => event.stopPropagation()}
          accessibilityViewIsModal
          accessible={false}
        >
          <View className="h-1.5 w-[54px] self-center rounded-full bg-line" />

          {title ? <Text variant="subtitle">{title}</Text> : null}
          {description ? <Text variant="body">{description}</Text> : null}

          {children ? body : null}
          {footer}
        </AnimatedPressable>
      </KeyboardAvoidingView>
    </Pressable>
  )
}
