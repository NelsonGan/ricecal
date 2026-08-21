import type { ReactNode } from 'react'
import { View } from 'react-native'

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
 * back button. A root screen has neither, and its title is a size larger.
 */
export function ScreenTitle({ title, leading, trailing, className }: ScreenTitleProps) {
  return (
    <View
      className={cn('flex-row items-center justify-between gap-md pt-1', className)}
      accessibilityRole="header"
    >
      {leading}
      {/*
        Shrinks rather than ellipsises.

        The title shares its row with a streak pill and a view toggle, and what
        goes in it is sometimes a date. "8月17日 周一" at the largest Dynamic Type
        setting did not fit and came back as "8月17日…", which is a title that
        has stopped saying which day it is about. A point or two smaller is
        legible; a truncated date is not.

        Safe beside `adjustsFontSizeToFit` because `Text` deliberately sets no
        `lineHeight` when it sees that prop — the React Native bug `StatTile`
        documents needs both together.
      */}
      <Text
        variant="screenTitle"
        className="flex-1"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {title}
      </Text>
      {trailing}
    </View>
  )
}
