import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { millilitres } from '@/lib/water'
import { useTheme } from '@/theme/useTheme'
import { cn, Icon, Text } from '@/ui'

export type TankFigureProps = {
  /** Millilitres so far. */
  ml: number
  /** The day's goal. */
  goalMl: number
  /** Which ground this copy is drawn on. `WaterTank` calls its child with both. */
  onWater: boolean
  /** Nothing to say yet: the drop holds the space and the figure waits. */
  loading?: boolean
}

/**
 * The day's water, written on the tank.
 *
 * SHARED because the colour rule is, and it is the fiddly part: Today draws
 * this with an Add button beside it and Trends draws it with nothing, but both
 * are a figure over a surface that fills up underneath it, and both need the
 * same two inks. A second copy of that rule would be a second copy of a
 * decision that took two screenshots and a contrast check to get right.
 *
 * The drop is what identifies the card. Neither surface has a heading over it
 * any more — the word "Water" over a tank of water is a label the picture
 * already carries — so on a day the tank is nearly empty and there is no blue
 * to recognise, the drop is doing that work alone.
 *
 * MILLILITRES, even on Trends, where every other figure is in litres. The unit
 * rule is per surface and this is the one card on that screen that is not a
 * summary: it is today, the same figure the home page is showing, and reading
 * "0.5 L" here against "500 ml" there would be two answers to one question.
 */
export function TankFigure({ ml, goalMl, onWater, loading = false }: TankFigureProps) {
  const { t } = useTranslation(['logging', 'common'])
  const { isDark } = useTheme()

  /**
   * The figure's colour once the water is over it.
   *
   * `on-water` is the design system's pairing for a label on a water fill, and
   * it is white — which is right on a chip and wrong here, because a figure in
   * white on `#4CC9F0` is about 1.9:1 and washes out on exactly the days
   * somebody most wants to read it. Dark ink on that same blue is 8:1. The dark
   * palette has no such problem: `on-water` is already near-black there,
   * against a brighter water, and `ink` would be the near-white that fails.
   */
  const wetInk = isDark ? 'text-on-water' : 'text-ink'

  return (
    <View className="flex-row items-center gap-1.5">
      <Icon set="body" name="water-drop" size={14} />
      {/* Hidden from a screen reader, both copies of it: the tank itself
          announces the same pair of figures as a sentence, and as a progress
          bar, which is the better of the two. */}
      <Text
        variant="meta"
        numberOfLines={1}
        className={onWater ? wetInk : 'text-water-ink'}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {loading
          ? ''
          : t('logging:water.count', { filled: millilitres(ml), goal: millilitres(goalMl) })}
      </Text>
    </View>
  )
}

/** What a tank drawn as a card is tall. Shared so the two surfaces agree. */
export const TANK_HEIGHT = 88

/** The overline a tank card wears when it needs to say which day it is about. */
export function TankLabel({ children, onWater }: { children: string; onWater: boolean }) {
  return (
    <Text
      variant="overline"
      className={cn(onWater ? 'text-on-water opacity-70' : 'text-water-ink opacity-60')}
    >
      {children}
    </Text>
  )
}
