import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import type { IconRef } from '@/data'
import { MealPhoto } from '@/features/shared'
import { radius, slab } from '@/theme/tokens'
import { Button, Icon, Squish } from '@/ui'

export type CookedPhotoTileProps = {
  /** The recipe's drawing, shown until there is a photo. */
  icon?: IconRef
  /** The shot, as the local file it was taken to. Drawn from disk, not the bucket. */
  photoUri?: string
  /** The upload is running. */
  attaching: boolean
  onPress: () => void
}

/**
 * The plate at the end of cook mode: the recipe's drawing in a soft green tile
 * until the cook photographs what they made, then that photo. The diary row
 * takes the photo, so the meal reads as the real thing rather than a drawing
 * of one.
 *
 * The tile is a button as well as the picture, with a camera badge to say so,
 * and the labelled button under it is the obvious way in for anybody who does
 * not tap pictures.
 */
export function CookedPhotoTile({ icon, photoUri, attaching, onPress }: CookedPhotoTileProps) {
  const { t } = useTranslation('recipes')
  const label = photoUri ? t('cook.retakePhoto') : t('cook.takePhoto')

  return (
    <View className="items-center gap-4">
      <Squish
        onPress={onPress}
        disabled={attaching}
        depth={slab.lg}
        radius={radius.card}
        containerClassName="w-[236px]"
        slabClassName="bg-pandan-soft-line"
        className="h-[236px] w-full items-center justify-center overflow-hidden rounded-card border-[3px] border-pandan-soft-line bg-pandan-soft"
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {attaching ? (
          // Resizing and sending a 3-6 MB frame is a second or two on a real
          // phone, long enough that an unchanged tile reads as nothing happening.
          <ActivityIndicator />
        ) : photoUri ? (
          <MealPhoto source={{ uri: photoUri }} />
        ) : (
          <Icon {...(icon ?? { set: 'food', name: 'cooking-pot' })} size={132} />
        )}
        {attaching ? null : (
          <View className="absolute right-3 bottom-3 h-[44px] w-[44px] items-center justify-center rounded-full border-[3px] border-pandan-soft-line bg-surface">
            <Icon set="system" name="camera" size={22} />
          </View>
        )}
      </Squish>

      {/* Centred by a row: a button sets `self-start` on its own box, which
          beats the column's `items-center`. */}
      <View className="flex-row justify-center">
        <Button
          variant="secondary"
          size="sm"
          disabled={attaching}
          onPress={onPress}
          leftIcon={<Icon set="system" name="camera" size={18} />}
        >
          {label}
        </Button>
      </View>
    </View>
  )
}
