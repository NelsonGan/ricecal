import type { ReactNode } from 'react'
import { View } from 'react-native'

import { Text } from '@/ui'

/**
 * A part of the recipe form under a sentence-case heading: "Ingredients 7" with
 * the pot's calories opposite, "Steps 5 steps" with Edit opposite.
 *
 * The form used the all-caps field label for these, the same weight as NAME and
 * SOURCE, so nothing said which parts were the recipe and which were details.
 */
export function FormSection({
  title,
  meta,
  action,
  children,
}: {
  title: string
  /** Quiet, straight after the title: a count. */
  meta?: string
  /** Opposite the title: a total, or the section's one action. */
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <View className="gap-2">
      <View className="min-h-[32px] flex-row items-center gap-3">
        <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
          <Text variant="subtitle" accessibilityRole="header" numberOfLines={1} className="shrink">
            {title}
          </Text>
          {meta ? <Text variant="meta">{meta}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  )
}
