import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Tappable, Text } from '@/ui'
import { AvatarFigure } from './AvatarFigure'
import { AVATAR_CANVAS } from './layers.generated'
import type { AvatarState } from './mood'
import type { Outfit } from './wardrobe'

/** Room under the figure for the one line of numbers. */
const CAPTION_HEIGHT = 30

/**
 * The avatar in Today's summary card, standing on a soft floor with the day's
 * one number under it. Sized to the height the stats take, so switching
 * between the two never moves the screen.
 */
export function AvatarSummary({
  outfit,
  state,
  height,
  figure,
  caption,
  onActionEnd,
  onPress,
  animated = true,
}: {
  outfit: Outfit
  state: AvatarState
  height: number
  /** The day's figure, as the ring shows it: "889". */
  figure: string
  /** What the figure is: "kcal left". */
  caption: string
  onActionEnd?: () => void
  /** Absent while the avatar only flashes over the stats for a bite. */
  onPress?: () => void
  /** Off while the screen is out of sight, so the idle loop stops redrawing. */
  animated?: boolean
}) {
  const { t } = useTranslation('avatar')
  const figureHeight = Math.max(0, height - CAPTION_HEIGHT)
  const width = (figureHeight * AVATAR_CANVAS.width) / AVATAR_CANVAS.height
  return (
    <Tappable
      onPress={onPress}
      disabled={!onPress}
      haptics={Boolean(onPress)}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={`${t(`mood.${state.mood}`)}. ${figure} ${caption}`}
      accessibilityHint={onPress ? t('openHint') : undefined}
      className="items-center"
      style={{ height }}
    >
      <View style={{ height: figureHeight, width }} className="items-center justify-end">
        {/* The floor the figure stands on. */}
        <View
          className="absolute rounded-full bg-pandan-soft"
          style={{
            width: width * 0.78,
            height: figureHeight * 0.075,
            bottom: figureHeight * 0.005,
          }}
        />
        <AvatarFigure
          outfit={outfit}
          state={state}
          width={width}
          onActionEnd={onActionEnd}
          animated={animated}
        />
      </View>
      <View className="h-[30px] flex-row items-baseline justify-center gap-1">
        <Text variant="numeric" className="text-[20px] leading-[26px]">
          {figure}
        </Text>
        <Text variant="caption">{caption}</Text>
      </View>
    </Tappable>
  )
}
