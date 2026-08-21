import { View } from 'react-native'

import { cn, Icon, type IconProps, Squish, Text } from '@/ui'
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
  /**
   * A drawing of the answer, at the TRAILING edge.
   *
   * Not beside the radio, which is where it wanted to go: the dot, the
   * illustration and two lines of text share one row, and putting the picture
   * on the left leaves "Retail, nursing, site work" about 200px to fit on a
   * small phone. On the right it costs the description nothing, and the column
   * of drawings gives the four options something to scan down.
   */
  icon?: IconProps
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
  icon,
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

      {/* 44, AND THE NUMBER IS THE iPHONE SE.
          The drawing is taller than the two lines of text, so it is what sets
          the card's height, and four of these plus a heading and a footer is
          the whole of a small screen. Measured on an SE: at 56 the fourth
          option sat under the CTA, at 48 its bottom edge landed exactly on it
          with nothing to spare, and 44 leaves about 13pt — which is the margin
          somebody running larger text needs. The question is "pick one of
          four", so an option below the fold is the one failure this screen
          cannot have.

          Decorative: the title beside it already says what it is, and the row
          carries one accessibility label for the whole card. */}
      {icon ? <Icon {...icon} size={44} /> : null}
    </Squish>
  )
}
