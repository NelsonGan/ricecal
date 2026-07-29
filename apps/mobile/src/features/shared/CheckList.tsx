import { View } from 'react-native'

import { cn, Icon, Text } from '@/ui'

export type CheckListProps = {
  items: readonly string[]
  className?: string
}

/**
 * The "what you get" list. A soft pandan bubble and a tick per line.
 *
 * One accessible node per line rather than per glyph — a screen reader should
 * hear "Unlimited meal logging", not "tick, Unlimited meal logging".
 */
export function CheckList({ items, className }: CheckListProps) {
  return (
    <View className={cn('gap-3', className)}>
      {items.map((item) => (
        <View key={item} className="flex-row items-center gap-3" accessible>
          <View className="h-6 w-6 items-center justify-center rounded-full bg-pandan-soft">
            <Icon set="ui" name="check" size={14} />
          </View>
          <Text variant="label" className="flex-1">
            {item}
          </Text>
        </View>
      ))}
    </View>
  )
}
