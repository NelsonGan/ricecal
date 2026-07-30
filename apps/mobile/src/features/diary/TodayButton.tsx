import { View } from 'react-native'

import { radius, slab, spacing } from '@/theme/tokens'
import { Squish, Text } from '@/ui'

export type TodayButtonProps = {
  label: string
  onPress: () => void
}

/**
 * The way back to today, floating over the bottom left.
 *
 * Only on screen when the diary is showing some other day, because that is the only
 * time it does anything — a button that is always there and usually inert teaches
 * people to ignore that corner.
 *
 * Bottom left rather than in the header. Getting back to today is a thumb action
 * taken while reading, and the top of the screen is where the labels are; the
 * opposite corner from the tab bar's centre action also keeps the two from being
 * mistaken for each other.
 */
export function TodayButton({ label, onPress }: TodayButtonProps) {
  return (
    // The offsets are a style rather than classes. `Squish` takes no `style` of its
    // own — it owns three layers and computes theirs — so the positioning lives on a
    // wrapper, where it is plain numbers off the same scale the rest of the screen
    // uses rather than two class names whose support is a question.
    <View
      className="absolute"
      style={{ left: spacing.gutter, bottom: spacing.gutter }}
      pointerEvents="box-none"
    >
      <Squish
        depth={slab.md}
        radius={radius.full}
        slabClassName="bg-pandan-slab"
        className="bg-pandan px-4 py-2.5"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text variant="label" className="text-on-pandan">
          {label}
        </Text>
      </Squish>
    </View>
  )
}
