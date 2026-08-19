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
      <Text variant="screenTitle" className="flex-1" numberOfLines={1}>
        {title}
      </Text>
      {trailing}
    </View>
  )
}
