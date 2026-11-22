import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Recipe, storedImageSource, useMealPhotoUrl } from '@/data'
import { MealPhoto } from '@/features/shared'
import { useThemeColors } from '@/theme/useTheme'
import { Icon, IconButton, Skeleton, Tappable, Text } from '@/ui'
import { totalMinutes } from './cooking'
import { PlatformLogo } from './PlatformLogo'
import { useDurationText } from './useDurationText'

export type RecipeCardProps = {
  recipe: Recipe
  onPress: () => void
  /** One serving into the day. Absent where logging is not on offer. */
  onLog?: () => void
}

/**
 * One recipe on the Recipes shelf, two to a row.
 *
 * Two columns rather than the three the Settings shelf had, because a cook
 * picks dinner by the picture and by how long it takes, and at a third of the
 * width neither the photo nor "1 h 10 min · 6 servings" survived. The calorie
 * pill stays on the photo; the plus beside the name is the one-tap log this app
 * exists for, so eating the same curry three days running is three taps.
 */
export function RecipeCard({ recipe, onPress, onLog }: RecipeCardProps) {
  const { t } = useTranslation(['recipes', 'common'])
  const duration = useDurationText()
  const colors = useThemeColors()
  const { data: photoUrl, isLoading: resolvingPhoto } = useMealPhotoUrl(recipe.photoPath)
  const photo = storedImageSource(recipe.photoPath, photoUrl)
  const calories = recipe.perServing.kcal.toLocaleString()
  const unit = t('common:unit.kcal')
  // A recipe with nothing in it yet has no price. "0 kcal" over its picture
  // reads as a fault, and a plus that logs it would put an empty row in the day.
  const priced = recipe.ingredientCount > 0
  const logs = Boolean(onLog && priced)
  /** Where the photo ends, which is where the plus beside the name sits. */
  const [photoHeight, setPhotoHeight] = useState(0)
  const minutes = totalMinutes(recipe)
  const meta = [
    minutes != null ? duration(minutes) : null,
    t('recipes:servings', { count: recipe.servings }),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <View className="w-[48%]">
      {/* One button for the card, and the plus over it rather than inside: a
          press target inside another reads to a screen reader as one label
          with a stray button in it. */}
      <Tappable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={[
          recipe.name,
          recipe.isFavourite ? t('recipes:card.favourite') : null,
          recipe.videoCredit ? t(`recipes:platform.${recipe.videoCredit.platform}`) : null,
          priced ? `${calories} ${unit}` : null,
          meta,
        ]
          .filter(Boolean)
          .join(', ')}
        className="gap-2"
      >
        <View
          testID="recipe-card-photo"
          onLayout={(event) => setPhotoHeight(event.nativeEvent.layout.height)}
          className="aspect-[4/3] items-center justify-center overflow-hidden rounded-tile border-[3px] border-line bg-track"
        >
          {photo ? (
            <MealPhoto source={photo} />
          ) : resolvingPhoto ? (
            <Skeleton width="100%" height="100%" rounded={false} className="bg-line" />
          ) : (
            <Icon {...(recipe.icon ?? { set: 'food', name: 'cooking-pot' })} size={72} />
          )}

          {recipe.isFavourite ? (
            <View className="absolute left-1.5 top-1.5 h-[28px] w-[28px] items-center justify-center rounded-full bg-surface">
              <Icon set="system" name="heart-filled" size={18} />
            </View>
          ) : null}

          {/* Where the video it came from was posted. Top right, because the
              favourite's heart holds the top left and the calories the
              bottom right. */}
          {recipe.videoCredit ? (
            <View className="absolute right-1.5 top-1.5">
              <PlatformLogo platform={recipe.videoCredit.platform} size={22} ring />
            </View>
          ) : null}

          {priced ? (
            <View className="absolute bottom-1.5 right-1.5 rounded-full bg-inverse/90 px-2 py-0.5">
              <Text variant="caption" className="text-on-inverse">
                {calories} {unit}
              </Text>
            </View>
          ) : null}
        </View>

        <View className="gap-0.5">
          {/* The name leaves the plus its room; the time line under it runs
              the card's whole width, so "1 h 30 min · 12 servings" fits. */}
          <Text variant="label" numberOfLines={2} className={logs ? 'pr-[34px]' : undefined}>
            {recipe.name}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </Tappable>

      {/* Beside the name, as the mockup had it, rather than on the photo's
          corner: there it was the same green plus as "New recipe" in the
          header, and a tap meant for the picture landed on it. Placed once the
          photo has a height, because the card's width decides it. */}
      {logs && photoHeight > 0 ? (
        <View className="absolute right-0" style={{ top: photoHeight + 6 }}>
          <IconButton
            variant="primary"
            size="xxs"
            hitSlop={8}
            accessibilityLabel={t('recipes:card.log', { name: recipe.name })}
            onPress={onLog}
          >
            <Icon set="ui" name="plus" size={14} tintColor={colors.onPandan} />
          </IconButton>
        </View>
      ) : null}
    </View>
  )
}
