import { useWindowDimensions, View } from 'react-native'

import { Text } from '@/ui'
import { labelWidth, spreadLabels } from './axis'

export type AxisLabel = {
  key: string
  text: string
  /** Where under the chart its bar or point sits, from the left. */
  centre: number
}

/**
 * The dates under a chart, as many as fit with room between them. Shared by
 * `BarChart` and `TrendLine`, so the two thin their labels the same way.
 */
export function AxisLabels({ labels, span }: { labels: readonly AxisLabel[]; span: number }) {
  const { fontScale } = useWindowDimensions()
  const widths = labels.map((label) => labelWidth(label.text) * fontScale)
  const placed =
    span > 0
      ? spreadLabels(
          labels.map((label) => label.centre),
          widths,
          span,
        )
      : []

  return (
    <View
      className="h-[14px]"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {placed.map(({ index, left, width }) => {
        // The width is an estimate, so each label gets a box with room to
        // spare rather than one that might clip it, anchored at the end it was
        // pulled in from, or on its own centre.
        const box = width + 24
        const align = left <= 0 ? 'left' : left >= span - width ? 'right' : 'center'
        return (
          <Text
            key={labels[index].key}
            numberOfLines={1}
            variant="micro"
            className="absolute"
            style={{
              width: box,
              textAlign: align,
              left:
                align === 'left' ? 0 : align === 'right' ? span - box : left + width / 2 - box / 2,
            }}
          >
            {labels[index].text}
          </Text>
        )
      })}
    </View>
  )
}
