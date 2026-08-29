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
}

// No `loading` state. `WaterTank` swaps the whole drawing for a placeholder
// before it calls its child, so a figure over a tank that has not answered yet
// is never rendered at all — a prop for it looked like it was doing something
// and could not have been.

/**
 * The day's water, written on the tank. Shared because the colour rule is: Today
 * draws this with an Add button and Trends with nothing, and both are a figure
 * over a surface that fills underneath it needing the same two inks.
 *
 * The drop identifies the card. Neither surface has a heading, so on a day the
 * tank is nearly empty the drop does that work alone.
 *
 * Millilitres, even on Trends, where every other figure is in litres: the unit
 * rule is per surface, and this is the one card there that is not a summary, so
 * "0.5 L" here against "500 ml" on Today would be two answers to one question.
 */
export function TankFigure({ ml, goalMl, onWater }: TankFigureProps) {
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
        {t('logging:water.count', { filled: millilitres(ml), goal: millilitres(goalMl) })}
      </Text>
    </View>
  )
}

/** What a tank drawn as a card is tall. Shared so the two surfaces agree. */
export const TANK_HEIGHT = 88

/** The overline a tank card wears when it needs to say which day it is about. */
export function TankLabel({ children, onWater }: { children: string; onWater: boolean }) {
  return (
    // `opacity-*` rather than the `/60` colour shorthand: every colour in this
    // app is a CSS variable holding a hex, and the shorthand needs raw channels
    // to build an alpha from. The utility is what the rest of the app uses.
    <Text
      variant="overline"
      className={cn('opacity-60', onWater ? 'text-on-water' : 'text-water-ink')}
    >
      {children}
    </Text>
  )
}
