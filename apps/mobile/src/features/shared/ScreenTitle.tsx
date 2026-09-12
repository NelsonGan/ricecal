import { type ReactNode, useCallback, useState } from 'react'
import { type LayoutChangeEvent, View } from 'react-native'

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
 * `AppBar` is the pushed-screen equivalent: it carries a back button, while a
 * root screen has neither and uses a size larger. Both centre the title against
 * the screen, not merely the room left between their controls.
 */
export function ScreenTitle({ title, leading, trailing, className }: ScreenTitleProps) {
  const [leadingWidth, setLeadingWidth] = useState(0)
  const [trailingWidth, setTrailingWidth] = useState(0)
  const sideWidth = Math.max(leadingWidth, trailingWidth)

  const measureLeading = useCallback((event: LayoutChangeEvent) => {
    setLeadingWidth(event.nativeEvent.layout.width)
  }, [])
  const measureTrailing = useCallback((event: LayoutChangeEvent) => {
    setTrailingWidth(event.nativeEvent.layout.width)
  }, [])

  return (
    <View className={cn('flex-row items-center gap-md pt-1', className)} accessibilityRole="header">
      <View
        testID="screen-title-leading-slot"
        style={{ minWidth: sideWidth }}
        className="items-start"
      >
        {leading ? (
          <View testID="screen-title-leading-measure" onLayout={measureLeading}>
            {leading}
          </View>
        ) : null}
      </View>
      {/*
        Shrinks rather than ellipsises, and centres within symmetric side slots.

        The wider control decides BOTH slot widths, so a search button or streak
        pill cannot push the title away from the screen's true centre. What goes
        in here is sometimes a date. "8月17日 周一" at the largest Dynamic Type
        setting did not fit and came back as "8月17日…", which is a title that has
        stopped saying which day it is about. A point or two smaller is legible;
        a truncated date is not.

        Safe beside `adjustsFontSizeToFit` because `Text` deliberately sets no
        `lineHeight` when it sees that prop — the React Native bug `StatTile`
        documents needs both together.
      */}
      <Text
        variant="screenTitle"
        className="min-w-0 flex-1 text-center"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {title}
      </Text>
      <View
        testID="screen-title-trailing-slot"
        style={{ minWidth: sideWidth }}
        className="items-end"
      >
        {trailing ? (
          <View testID="screen-title-trailing-measure" onLayout={measureTrailing}>
            {trailing}
          </View>
        ) : null}
      </View>
    </View>
  )
}
