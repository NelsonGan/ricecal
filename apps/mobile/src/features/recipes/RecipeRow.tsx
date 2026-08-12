import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Recipe } from '@/data'
import { ItemRow, ROW_TEXT_INDENT } from '@/features/shared'
import { Badge, cn } from '@/ui'

export type RecipeRowProps = {
  recipe: Recipe
  onPress: () => void
}

/**
 * One recipe in a list.
 *
 * A ROW and not a card. It used to carry its own `Card`, which put 28pt of
 * padding and a slab under every recipe and spread eight of them over three
 * screens of scrolling — the shelf read as eight separate things rather than as
 * one list. The caller groups them into a single card now, the way the day's
 * entries are grouped on Today, and the rows sit at the card's own `gap-3`.
 *
 * The detail line answers a different question on each shelf, which is why it
 * is built here rather than passed in: on my own recipes it is the portion
 * ("4 servings · 6 ingredients"), and on the community it is who cooked it
 * and how many people kept it. The number on the right is always the SERVING,
 * never the pot — that is what logging it will cost, and a list that showed the
 * pot would put 2,630 next to a bowl of rendang.
 */
export function RecipeRow({ recipe, onPress }: RecipeRowProps) {
  const { t } = useTranslation('recipes')

  // The number on the right is already "what one serving costs", so the detail
  // line does not repeat it — said twice it truncated on a 393pt screen, and the
  // half of it that survived was the half already on the right.
  const detail =
    recipe.isMine || recipe.isOfficial
      ? `${t('servings', { count: recipe.servings })} · ${t('ingredients', {
          count: recipe.ingredientCount,
        })}`
      : t('byAuthor', {
          name: recipe.authorName || t('someCook'),
          saves: t('savedTimes', { count: recipe.savedCount }),
        })

  return (
    <View className="gap-2">
      <ItemRow
        title={recipe.name}
        detail={detail}
        icon={recipe.icon}
        photoPath={recipe.photoPath}
        value={recipe.perServing.kcal}
        unit="kcal"
        onPress={onPress}
      />
      {/* Only on your own, and only when there is something to say. The badge
          reports where a PUBLISHED recipe has got to; a private one is not
          waiting for anything and says nothing.

          Indented to the row's text column so it reads as belonging to the
          recipe above it rather than to the gap between two of them, which is
          what it looked like once the rows lost their cards. */}
      {recipe.isMine && recipe.isPublic ? (
        <View className={cn('flex-row', ROW_TEXT_INDENT)}>
          <ReviewBadge recipe={recipe} />
        </View>
      ) : null}
    </View>
  )
}

function ReviewBadge({ recipe }: { recipe: Recipe }) {
  const { t } = useTranslation('recipes')

  if (recipe.review === 'approved') {
    return <Badge tone="pandan">{t('review.badgePublic')}</Badge>
  }
  if (recipe.review === 'rejected') {
    return <Badge tone="hibiscus">{t('review.badgeRejected')}</Badge>
  }
  return <Badge tone="neutral">{t('review.badgePending')}</Badge>
}
