import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Recipe, RecipeShelf } from '@/data'
import { useRecipes } from '@/data'
import { ItemRow } from '@/features/shared'
import { useDebouncedValue } from '@/lib/use-debounce'
import { useThemeColors } from '@/theme/useTheme'
import { Icon, IconButton, SearchField, SegmentedControl, Tappable, Text } from '@/ui'

const SHELVES: RecipeShelf[] = ['mine', 'official', 'community']

/**
 * How many recipes the sheet lists before it stops.
 *
 * A cap rather than a scroll, because this panel sits inside the log sheet
 * under three other panels' worth of chrome. Twelve is more than anybody scans
 * by eye, and the search field above is the answer past that — which is the
 * whole reason it exists.
 */
const SHOWN = 12

export type RecipePanelProps = {
  /** Log this recipe straight onto the day. One serving. */
  onLog: (recipe: Recipe) => void
  /** Open the recipe itself, for a different portion or a look at the steps. */
  onOpen: (recipe: Recipe) => void
  /** The full list, all three shelves. */
  onSeeAll: () => void
}

/**
 * The fourth way to log: something somebody cooked.
 *
 * ALL THREE SHELVES, searched one at a time. It used to be four of your own
 * recipes and a link to the tab, which was right when the only recipes that
 * existed were yours: the kitchen's and the community's both have to be saved
 * as a copy before they can be logged, and a copy is a decision rather than a
 * log. But "I cannot reach it from here" is a worse answer than "reaching it
 * takes one more tap", and somebody who has just remembered a rendang they
 * saw on the community tab is in this sheet, not on that one.
 *
 * So the shelf is a choice and the search is SCOPED TO IT. Searching all three
 * at once was the other option and it is worse: the three answer different
 * questions ("the one I wrote", "the one you wrote", "the one anybody wrote"),
 * and merged into one list the only way to tell them apart is a badge on every
 * row. The segmented control says which question is being asked.
 *
 * THE PLUS IS ONLY ON YOUR OWN, and that is the invariant rather than a
 * simplification. A logged entry points at the recipe's mirror catalogue row,
 * so logging somebody else's directly would put their future corrections into
 * your past diary — they change the servings next month and last Tuesday's
 * dinner moves. Their rows open the recipe instead, which is where "Save to my
 * recipes" is, and the copy is what gets logged.
 */
export function RecipePanel({ onLog, onOpen, onSeeAll }: RecipePanelProps) {
  const { t } = useTranslation(['recipes', 'common'])
  const colors = useThemeColors()

  const [shelf, setShelf] = useState<RecipeShelf>('mine')
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query)

  const { data: recipes = [], isFetching } = useRecipes(shelf, debounced)

  const searched = debounced.trim().length > 0
  // Only while there is nothing to show. A "nothing found" line over a list
  // that still has last query's rows in it contradicts what is under it.
  const empty = recipes.length === 0 && !isFetching

  return (
    <View className="gap-3">
      <SegmentedControl
        options={SHELVES.map((value) => ({ value, label: t(`recipes:shelf.${value}`) }))}
        value={shelf}
        onChange={(next) => {
          setShelf(next)
          // The query belongs to the shelf that was showing. Carried across, it
          // reads as "no official recipes match" when what happened is that the
          // user changed shelf and the field kept a word from the last one.
          // Same reasoning as the Recipes tab.
          setQuery('')
        }}
      />

      <SearchField
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery('')}
        clearLabel={t('recipes:search.clear')}
        placeholder={t(`recipes:search.${shelf}`)}
        returnKeyType="search"
      />

      {empty ? (
        <Text variant="meta">
          {searched ? t('recipes:search.none') : t(`recipes:log.empty.${shelf}`)}
        </Text>
      ) : null}

      {recipes.slice(0, SHOWN).map((recipe) => (
        <ItemRow
          key={recipe.id}
          title={recipe.name}
          icon={recipe.icon}
          photoPath={recipe.photoPath}
          // What the row answers depends on whose it is, the same split the
          // recipe list makes: your own is a portion, somebody else's is who
          // cooked it and how many people kept it. The save count is the only
          // thing on a community row that says whether anybody liked it, and
          // it is what that shelf is ordered by.
          detail={
            recipe.isMine || recipe.isOfficial
              ? t('recipes:servings', { count: recipe.servings })
              : t('recipes:byAuthor', {
                  name: recipe.authorName || t('recipes:someCook'),
                  saves: t('recipes:savedTimes', { count: recipe.savedCount }),
                })
          }
          value={recipe.perServing.kcal}
          unit="kcal"
          onPress={() => onOpen(recipe)}
          trailing={
            recipe.isMine ? (
              <IconButton
                size="sm"
                variant="primary"
                accessibilityLabel={`${t('common:action.add')}, ${recipe.name}`}
                onPress={() => onLog(recipe)}
              >
                <Icon set="ui" name="plus" size={18} tintColor={colors.onPandan} />
              </IconButton>
            ) : (
              // A chevron rather than a plus, because the tap does something
              // else: it opens the recipe so a copy can be saved first. A plus
              // here would promise a one-tap log this row cannot honour.
              <Icon set="ui" name="chevron-right" size={18} tintColor={colors.muted} />
            )
          }
        />
      ))}

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
