import type { ReactNode } from 'react'
import { useWindowDimensions, View } from 'react-native'

import { cn, Text } from '@/ui'

export type ScreenTitleProps = {
  title: string
  /**
   * One control BEFORE the title — a view toggle, a back-to-today.
   *
   * Ahead of the heading rather than opposite it, for a control that changes
   * what the heading is ABOUT: the calendar toggle on Today swaps the whole
   * screen under the date, and read after the date it is a control looking for
   * its subject. `trailing` is for the other kind — a badge reporting on what
   * the heading already says.
   */
  leading?: ReactNode
  /** A streak pill, a date, a filter — one thing, right aligned. */
  trailing?: ReactNode
  className?: string
}

/**
 * The title row at the top of a root screen.
 *
 * `AppBar` is the pushed-screen equivalent: it centres its title and carries a
 * back button. A root screen has neither, so its larger title stays left aligned.
 */
export function ScreenTitle({ title, leading, trailing, className }: ScreenTitleProps) {
  const { fontScale } = useWindowDimensions()
  const wideText = fontScale > 1.3
  return (
    <View className={cn('gap-3 pt-1', className)} accessibilityRole="header">
      <View className="flex-row items-center justify-between gap-md">
        {leading}
        {/* Dates must remain complete. With large text the title wraps and
            the badge gets its own row; at ordinary sizes the title can shrink.
            Text omits lineHeight when shrinking to avoid the native bug
            documented in StatTile. */}
        <Text
          variant="screenTitle"
          className="flex-1 text-left"
          numberOfLines={wideText ? undefined : 1}
          adjustsFontSizeToFit={!wideText}
          minimumFontScale={0.85}
        >
          {title}
        </Text>
        {!wideText ? trailing : null}
      </View>
      {wideText && trailing ? <View className="max-w-full self-start">{trailing}</View> : null}
    </View>
  )
}
