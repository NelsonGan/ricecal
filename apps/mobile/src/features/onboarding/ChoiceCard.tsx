import { View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
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
  accent?: Accent
  /**
   * A drawing of the answer, at the LEADING edge.
   *
   * It used to sit at the trailing edge because a radio dot already held the
   * leading one, and the dot, the drawing and two lines of text could not share
   * a small phone's row. The dot is gone: the selected card is filled and
   * carries a check at the end instead, the way the rest of the flow marks a
   * choice, so the picture can lead and be scanned down as a column.
   */
  icon?: IconProps
  className?: string
}

/**
 * A radio option rendered as a card.
 *
 * `Radio` from the design system is the right control for a compact list; this
 * is the onboarding variant, where each option is a full-width squishy card.
 * Same role and same state to a screen reader.
 */
export function ChoiceCard({
  title,
  description,
  selected,
  onPress,
  accent = 'pandan',
  icon,
  className,
}: ChoiceCardProps) {
  const tone = selectedStyles[accent]
  const colors = useThemeColors()

  return (
    <Squish
      depth={4}
      radius={22}
      containerClassName={className}
      slabClassName={selected ? tone.slab : 'bg-line'}
      className={cn(
        'flex-row items-center gap-3.5 border-[3px] px-4 py-3.5',
        selected ? `${tone.border} ${tone.fill}` : 'border-line bg-surface',
      )}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={description ? `${title}. ${description}` : title}
    >
      {/* 44, AND THE NUMBER IS THE iPHONE SE. The drawing is taller than the two
          lines of text, so it sets the card's height, and four of these plus a
          heading and a footer is the whole of a small screen. Decorative: the
          card carries one accessibility label for the whole row. */}
      {icon ? <Icon {...icon} size={44} /> : null}

      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="bodyStrong">{title}</Text>
        {description ? <Text variant="meta">{description}</Text> : null}
      </View>

      <View
        className={cn(
          'h-[26px] w-[26px] items-center justify-center rounded-full',
          selected ? tone.dot : 'border-[3px] border-line',
        )}
      >
        {selected ? <Icon set="ui" name="check" size={14} tintColor={colors.onPandan} /> : null}
      </View>
    </Squish>
  )
}
