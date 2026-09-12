import { View } from 'react-native'

import { cn, Text } from '@/ui'

export type ProWordmarkProps = {
  className?: string
}

/** The product name, with the paid tier treated as a badge rather than prose. */
export function ProWordmark({ className }: ProWordmarkProps) {
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel="RiceCal Pro"
      className={cn('flex-row items-center justify-center gap-1.5', className)}
    >
      <Text variant="subtitle">RiceCal</Text>
      <View className="min-h-[28px] min-w-[46px] items-center justify-center rounded-[8px] bg-inverse px-2 py-[1px]">
        {/* The two words use the same face and size. Only the tier changes
            surface, so the mark still reads as one name rather than a title
            followed by a small status chip. */}
        <Text variant="subtitle" className="text-inverse-accent">
          Pro
        </Text>
      </View>
    </View>
  )
}
