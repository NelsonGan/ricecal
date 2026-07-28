import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'

import { cn } from './cn'
import { Icon } from './Icon'
import { Text } from './Text'

export type ListRowProps = {
  title: string
  /** Second line: a current value, a count, a time. */
  subtitle?: string
  /** Leading slot — an Icon, an Avatar, a dish image. */
  leading?: ReactNode
  /** Trailing slot. Overrides the default chevron. */
  trailing?: ReactNode
  /** Show the chevron. Defaults to on when the row is pressable. */
  chevron?: boolean
  /** Hairline under the row. Off for the last row in a group. */
  divider?: boolean
  onPress?: () => void
  disabled?: boolean
  className?: string
}

/**
 * A settings or detail row.
 *
 * The chevron appears only when the row leads somewhere, which is the one cue
 * that separates a navigable row from a read-only one. Passing `trailing`
 * replaces it, because a row with both a switch and a chevron is telling the
 * user two different things.
 */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  chevron,
  divider = true,
  onPress,
  disabled = false,
  className,
}: ListRowProps) {
  const showChevron = chevron ?? (Boolean(onPress) && !trailing)

  const content = (
    <View
      className={cn(
        'min-h-sm flex-row items-center gap-md py-3.5',
        divider && 'border-b-2 border-track',
        disabled && 'opacity-50',
        className,
      )}
    >
      {leading}
      <View className="flex-1 gap-0.5">
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="meta" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {showChevron ? <Icon set="ui" name="chevron-right" size={20} /> : null}
    </View>
  )

  if (!onPress) return content

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ disabled }}
    >
      {content}
    </Pressable>
  )
}
