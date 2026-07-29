import type { ReactNode } from 'react'
import { View } from 'react-native'

import { cn, Text } from '@/ui'

export type ScreenTitleProps = {
  title: string
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
export function ScreenTitle({ title, trailing, className }: ScreenTitleProps) {
  return (
    <View
      className={cn('flex-row items-center justify-between gap-md pt-1', className)}
      accessibilityRole="header"
    >
      <Text
        className="flex-1 font-display text-[26px] leading-[32px] text-heading"
        numberOfLines={1}
      >
        {title}
      </Text>
      {trailing}
    </View>
  )
}
