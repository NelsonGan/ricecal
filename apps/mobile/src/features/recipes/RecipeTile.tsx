import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Recipe, storedImageSource, useMealPhotoUrl } from '@/data'
import { MealPhoto } from '@/features/shared'
import { Icon, Skeleton, Tappable, Text } from '@/ui'

export type RecipeTileProps = {
  recipe: Recipe
  onPress: () => void
}

/**
 * One food in the three-column shelf.
 *
 * The artwork does the finding, the name confirms it, and the calorie pill is
 * the one figure needed before opening the food. Servings, ingredients, author
 * and saves all belong on the detail screen; beside every tile they made the
 * shelf read like a database table rather than a collection of food.
 */
export function RecipeTile({ recipe, onPress }: RecipeTileProps) {
  const { t } = useTranslation('common')
  const { data: photoUrl, isLoading: resolvingPhoto } = useMealPhotoUrl(recipe.photoPath)
  const photo = storedImageSource(recipe.photoPath, photoUrl)
  const unit = t('unit.kcal')
  const calories = recipe.perServing.kcal.toLocaleString()

  return (
    <Tappable
      className="w-[31%] gap-2"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${recipe.name}, ${calories} ${unit}`}
    >
      <View className="aspect-square items-center justify-center overflow-hidden rounded-tile border-[3px] border-line bg-track">
        {photo ? (
          <MealPhoto source={photo} />
        ) : resolvingPhoto ? (
          <Skeleton width="100%" height="100%" rounded={false} className="bg-line" />
        ) : recipe.icon ? (
          <Icon {...recipe.icon} size={72} />
        ) : (
          <Icon set="food" name="cooking-pot" size={72} />
        )}

        <View className="absolute right-1.5 top-1.5 rounded-full bg-inverse/90 px-1.5 py-0.5">
          <Text variant="micro" className="text-on-inverse">
            {calories} {unit}
          </Text>
        </View>
      </View>

      <Text
        variant="caption"
        numberOfLines={2}
        ellipsizeMode="tail"
        className="min-h-[34px] text-ink"
      >
        {recipe.name}
      </Text>
    </Tappable>
  )
}
