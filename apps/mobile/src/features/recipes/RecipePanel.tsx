import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Recipe } from '@/data'
import { useRecipes } from '@/data'
import { ItemRow } from '@/features/shared'
import { useThemeColors } from '@/theme/useTheme'
import { Icon, IconButton, Tappable, Text } from '@/ui'

/** How many of your own recipes the log sheet offers before sending you to the list. */
const SHOWN = 4

export type RecipePanelProps = {
  /** Log this recipe straight onto the day. One serving. */
  onLog: (recipe: Recipe) => void
  /** Open the recipe itself, for a different portion or a look at the steps. */
  onOpen: (recipe: Recipe) => void
  /** The full list, all three shelves. */
  onSeeAll: () => void
}

/**
 * The fourth way to log: something you cooked.
 *
 * Your OWN recipes only, and the shortest possible list of them. The other two
 * shelves are somebody else's cooking, which has to be saved as a copy before it
 * can be logged — that is a decision, not a log, and it belongs on the recipe
 * rather than in a sheet whose whole job is to be one tap.
 *
 * The plus button logs one serving where it stands. The row itself opens the
 * recipe, which is where a different portion is chosen. Same split as the recent
 * dishes above it, so the two lists behave the same way under a thumb.
 */
export function RecipePanel({ onLog, onOpen, onSeeAll }: RecipePanelProps) {
  const { t } = useTranslation(['recipes', 'common'])
  const colors = useThemeColors()
  const { data: recipes = [] } = useRecipes('mine')

  return (
    <View className="gap-3">
      {recipes.length === 0 ? (
        <Text variant="meta">{t('recipes:log.empty')}</Text>
      ) : (
        recipes.slice(0, SHOWN).map((recipe) => (
          <ItemRow
            key={recipe.id}
            title={recipe.name}
            icon={recipe.icon}
            photoPath={recipe.photoPath}
            detail={t('recipes:servings', { count: recipe.servings })}
            value={recipe.perServing.kcal}
            unit="kcal"
            onPress={() => onOpen(recipe)}
            trailing={
              <IconButton
                size="sm"
                variant="primary"
                accessibilityLabel={`${t('common:action.add')}, ${recipe.name}`}
                onPress={() => onLog(recipe)}
              >
                <Icon set="ui" name="plus" size={18} tintColor={colors.onPandan} />
              </IconButton>
            }
          />
        ))
      )}

      <Tappable
        onPress={onSeeAll}
        className="flex-row items-center justify-center gap-2 rounded-tile border-[3px] border-line border-dashed p-3"
        accessibilityRole="button"
        accessibilityLabel={t('recipes:log.seeAll')}
      >
        <Icon set="food" name="cooking-pot" size={20} />
        <Text variant="label" className="text-muted">
          {t('recipes:log.seeAll')}
        </Text>
      </Tappable>
    </View>
  )
}
