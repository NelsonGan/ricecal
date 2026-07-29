import { View } from 'react-native'

import { cn, Squish, Text } from '@/ui'
import type { Accent } from './OnboardingStep'

const selectedStyles: Record<Accent, { border: string; fill: string; slab: string; dot: string }> =
  {
    pandan: {
      border: 'border-pandan',
      fill: 'bg-pandan-soft',
      slab: 'bg-pandan-soft-line',
      dot: 'bg-pandan',
    },
    kaya: {
      border: 'border-kaya',
      fill: 'bg-kaya-soft',
      slab: 'bg-kaya-soft-line',
      dot: 'bg-kaya',
    },
    water: {
      border: 'border-water',
      fill: 'bg-water-soft',
      slab: 'bg-water-soft-line',
      dot: 'bg-water',
    },
    hibiscus: {
      border: 'border-hibiscus',
      fill: 'bg-hibiscus-soft',
      slab: 'bg-hibiscus-soft-line',
      dot: 'bg-hibiscus',
    },
  }

export type ChoiceCardProps = {
  title: string
  description?: string
  selected: boolean
  onPress: () => void
  accent: Accent
  className?: string
}

/**
 * A radio option rendered as a card.
 *
 * `Radio` from the design system is the right control for a compact list; this
 * is the onboarding variant, where each option is a full-width squishy card in
 * the step's accent. Same role and same state to a screen reader.
 */
export function ChoiceCard({
  title,
  description,
  selected,
  onPress,
  accent,
  className,
}: ChoiceCardProps) {
  const tone = selectedStyles[accent]

  return (
    <Squish
      depth={5}
      radius={22}
      containerClassName={className}
      slabClassName={selected ? tone.slab : 'bg-line'}
      className={cn(
        'flex-row items-center gap-3.5 border-[3px] p-[18px]',
        selected ? `${tone.border} ${tone.fill}` : 'border-line bg-surface',
      )}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={description ? `${title}. ${description}` : title}
    >
      <View
        className={cn(
          'h-[26px] w-[26px] items-center justify-center rounded-full border-[3px]',
          selected ? tone.border : 'border-line-strong',
        )}
      >
        {selected ? <View className={cn('h-3 w-3 rounded-full', tone.dot)} /> : null}
      </View>

      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="bodyStrong">{title}</Text>
        {description ? <Text variant="meta">{description}</Text> : null}
      </View>
    </Squish>
  )
}
