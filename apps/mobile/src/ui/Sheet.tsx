import type { ReactNode } from 'react'
import { Modal, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { spacing } from '@/theme/tokens'
import { cn } from './cn'
import { Text } from './Text'

export type SheetProps = {
  visible: boolean
  onClose: () => void
  title?: string
  description?: string
  /** Pinned below the scrollable body — the action row. */
  footer?: ReactNode
  /** Let the body scroll. Off for short, fixed content. */
  scrollable?: boolean
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
 */
export function Sheet({
  visible,
  onClose,
  title,
  description,
  footer,
  scrollable = true,
  children,
  className,
}: SheetProps) {
  const insets = useSafeAreaInsets()

  const body = scrollable ? (
    <ScrollView
      className="max-h-[440px]"
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* The scrim is deliberately NOT an accessibility element. Giving it a
          role and a label makes the whole overlay one node, and VoiceOver then
          reads "Close button" and nothing else — the sheet's own title and
          buttons never reach the user. Dismissal stays available through the
          back gesture and `onRequestClose`. */}
      <Pressable
        className="flex-1 justify-end bg-black/40"
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
      >
        <Pressable
          className={cn('gap-md rounded-t-card bg-surface px-gutter pt-md', className)}
          style={{ paddingBottom: insets.bottom + spacing.gutter }}
          onPress={(event) => event.stopPropagation()}
          accessibilityViewIsModal
          accessible={false}
        >
          <View className="h-1.5 w-[54px] self-center rounded-full bg-line" />

          {title ? <Text variant="subtitle">{title}</Text> : null}
          {description ? <Text variant="body">{description}</Text> : null}

          {children ? body : null}
          {footer}
        </Pressable>
      </Pressable>
    </Modal>
  )
}
