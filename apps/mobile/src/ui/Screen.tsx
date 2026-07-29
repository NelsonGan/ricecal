import type { ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { spacing } from '@/theme/tokens'
import { cn } from './cn'

export type ScreenProps = Omit<ScrollViewProps, 'contentContainerStyle'> & {
  children: ReactNode
  /** Content pinned below the scroll area — the footer CTA. Never scrolls away. */
  footer?: ReactNode
  /** Drop the 20pt screen gutter, for content that bleeds to the edge. */
  flush?: boolean
  /** Render children in a plain View instead of a ScrollView. */
  scroll?: boolean
  /**
   * Extra points between the keyboard and the content, for the cases where
   * this view's frame does not start where it appears to.
   *
   * 0 is right under a navigator, which lays the screen out below the header
   * already. Pass `useHeaderHeight()` only if a header overlaps this view —
   * `insets.top` is never the right answer, and floats the footer a status bar
   * clear of the keyboard.
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
 * its own ScrollView. Three things have to line up or a focused input ends up
 * under the keyboard:
 *
 * - `automaticallyAdjustKeyboardInsets` (iOS) lets UIKit inset the scroll view
 *   by the real keyboard frame, which is more accurate than measuring it in JS
 *   and handles the hardware keyboard and floating iPad keyboard for free.
 * - `KeyboardAvoidingView` with `padding` carries the footer CTA above the
 *   keyboard. Android is left on `undefined` because `adjustResize` — which
 *   Expo sets by default — already resizes the window, and stacking both
 *   double-counts the inset.
 * - `keyboardShouldPersistTaps="handled"` makes the first tap on a button
 *   activate it instead of being eaten dismissing the keyboard. Without it
 *   every form needs two taps to submit.
 *
 * The first two look like they should double-count on iOS, and do not: the
 * KeyboardAvoidingView shrinks the scroll view out from under the keyboard
 * first, so by the time UIKit measures the overlap for its own inset there is
 * none left to add. Verified on device — if you change one of them, check the
 * other still behaves.
 */
export function Screen({
  children,
  footer,
  flush = false,
  scroll = true,
  keyboardOffset = 0,
  className,
  contentClassName,
  ...rest
}: ScreenProps) {
  const insets = useSafeAreaInsets()

  const body = scroll ? (
    <ScrollView
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
    </ScrollView>
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardOffset}
    >
      {body}
      {footer ? (
        // No rule above the footer. The design separates it with space and the
        // canvas colour alone, and a hairline under a full-width CTA reads as a
        // seam rather than a divider.
        <View
          className="gap-md bg-canvas px-gutter pt-md"
          style={{ paddingBottom: insets.bottom + spacing.md }}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  )
}
