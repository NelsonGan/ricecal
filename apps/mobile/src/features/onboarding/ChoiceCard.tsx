import { View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { cn, Icon, type IconProps, Squish, Text } from '@/ui'

export type ChoiceCardProps = {
  title: string
  description?: string
  selected: boolean
  onPress: () => void
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
 * is the onboarding variant, where each option is a full-width squishy card in
 * pandan, the flow's one colour.
 * Same role and same state to a screen reader.
 */
export function ChoiceCard({
  title,
  description,
  selected,
  onPress,
  icon,
  className,
}: ChoiceCardProps) {
  const colors = useThemeColors()

  return (
    <Squish
      depth={3}
      radius={20}
      containerClassName={className}
      slabClassName={selected ? 'bg-pandan-soft-line' : 'bg-line'}
      className={cn(
        'flex-row items-center gap-3 border-2 px-3.5 py-3',
        selected ? 'border-pandan bg-pandan-soft' : 'border-line bg-surface',
      )}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={description ? `${title}. ${description}` : title}
    >
      {/* 36: the drawing is taller than the two lines of text, so it sets the
          card's height, and four of these plus a heading and a footer is the
          whole of a small screen. At 44 the fourth option had about 13pt to
          spare on an iPhone SE; 36 leaves room for larger text. Decorative: the
          card carries one accessibility label for the whole row. */}
      {icon ? <Icon {...icon} size={36} /> : null}

      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="bodyStrong">{title}</Text>
        {description ? <Text variant="meta">{description}</Text> : null}
      </View>

      <View
        className={cn(
          'h-[22px] w-[22px] items-center justify-center rounded-full',
          selected ? 'bg-pandan' : 'border-2 border-line-strong',
        )}
      >
        {selected ? <Icon set="ui" name="check" size={12} tintColor={colors.onPandan} /> : null}
      </View>
    </Squish>
  )
}
