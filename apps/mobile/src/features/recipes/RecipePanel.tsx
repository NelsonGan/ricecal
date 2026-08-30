import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Recipe, RecipeShelf } from '@/data'
import { useRecipes } from '@/data'
import { ItemRow } from '@/features/shared'
import { useDebouncedValue } from '@/lib/use-debounce'
import { useThemeColors } from '@/theme/useTheme'
import { Icon, IconButton, SearchField, SegmentedControl, Text } from '@/ui'

const SHELVES: RecipeShelf[] = ['mine', 'official', 'community']

/**
 * How many recipes the sheet lists before it stops.
 *
 * The panel scrolls, so this is not about fitting: it is about not rendering a
 * hundred rows into a sheet nobody scrolls a hundred rows of. Twelve is more
 * than anybody reads by eye, and the field above is the answer past that —
 * which is the whole reason it is there and takes the keyboard on open.
 */
const SHOWN = 12

export type RecipePanelProps = {
  /** Log this recipe straight onto the day. One serving. */
  onLog: (recipe: Recipe) => void
  /** Open the recipe itself, for a different portion or a look at the steps. */
  onOpen: (recipe: Recipe) => void
  /** Raise the keyboard on the search field as the panel opens. */
  autoFocus?: boolean
}

/**
 * The fourth way to log: something somebody cooked.
 *
 * All three shelves, searched one at a time. It used to be four of your own
 * recipes and a link to the tab, which was right when the only recipes were
 * yours, but "I cannot reach it from here" is a worse answer than one more tap.
 *
 * The shelf is a choice and the search is scoped to it. The three answer
 * different questions, and merged into one list the only way to tell them apart
 * is a badge on every row.
 *
 * That search is the whole panel, which is why it takes the keyboard on open as
 * the catalogue search does.
 *
 * The plus is only on your own, which is an invariant rather than a
 * simplification: a logged entry points at the recipe's mirror catalogue row, so
 * logging somebody else's would put their future corrections into your past
 * diary. Their rows open the recipe, where "Save to my recipes" is.
 */
export function RecipePanel({ onLog, onOpen, autoFocus = false }: RecipePanelProps) {
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
        autoFocus={autoFocus}
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
          unit={t('common:unit.kcal')}
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
    </View>
  )
}
