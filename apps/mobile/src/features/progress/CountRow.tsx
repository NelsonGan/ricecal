import { View } from 'react-native'

import { ProgressBar, Text } from '@/ui'

export type CountRowProps = {
  label: string
  /** How many of `total` cleared the bar. */
  done: number
  total: number
  /** "5 of 7". Passed in rather than assembled, because it is translated copy. */
  caption: string
}

/**
 * "Days under 2,100 · 5 of 7", with the same fraction drawn underneath.
 *
 * The bar is not redundant with the caption. "21 of 30" takes a second to place
 * and its bar does not, which is the whole job of the card it sits in — these
 * are the rows somebody scrolls past rather than reads.
 *
 * `animateOnMount` off: three of these fill at once every time a range or a tab
 * changes, and a card that re-animates on every tap reads as a page load.
 */
export function CountRow({ label, done, total, caption }: CountRowProps) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between gap-md">
        <Text variant="label" className="min-w-0 flex-1" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="label" className="text-muted">
          {caption}
        </Text>
      </View>
      <ProgressBar
        value={total > 0 ? done / total : 0}
        height={9}
        animateOnMount={false}
        accessibilityLabel={`${label}: ${caption}`}
      />
    </View>
  )
}
