import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type RecipeShelf, useRecipeQuota, useRecipes } from '@/data'
import { useRequirePro } from '@/features/paywall'
import { RecipeRow } from '@/features/recipes'
import { ROW_TILE, ScreenTitle } from '@/features/shared'
import { useDebouncedValue } from '@/lib/use-debounce'
import { useThemeColors } from '@/theme/useTheme'
import {
  Card,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  SearchField,
  SegmentedControl,
  Skeleton,
} from '@/ui'

const SHELVES: RecipeShelf[] = ['mine', 'official', 'community']

const SKELETON_ROWS = ['r1', 'r2', 'r3'] as const

/**
 * R1 / R1B / R1D — the three shelves of the recipe list, and the Recipes tab.
 *
 * One screen and not three, because they are one list read three ways: the same
 * row, the same tap target, the same numbers. What changes is who wrote the
 * recipe, and the segmented control says which of those is showing.
 *
 * A ROOT screen, so it carries a `ScreenTitle` rather than an `AppBar`: there is
 * nothing behind it to go back to. The heading changes with the shelf, which is
 * the one thing it does that the other tabs' titles do not — "My recipes" and
 * "From the community" are different places, and the segmented control under it
 * is what moved between them.
 */
export default function RecipesScreen() {
  const { t } = useTranslation(['recipes', 'common'])
  const router = useRouter()
  const requirePro = useRequirePro()
  const quota = useRecipeQuota()
  const colors = useThemeColors()

  const [shelf, setShelf] = useState<RecipeShelf>('mine')
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query)

  const { data: recipes = [], isFetching } = useRecipes(shelf, debounced)

  // Only while there is nothing to show. Skeletons over a list that already has
  // rows in it makes a refetch look like a reload.
  const loading = isFetching && recipes.length === 0
  const searched = debounced.trim().length > 0

  return (
    <Screen>
      <ScreenTitle
        title={t(`recipes:heading.${shelf}`)}
        trailing={
          <IconButton
            variant="primary"
            accessibilityLabel={t('recipes:new.title')}
            onPress={() => {
              // THE FOURTH ONE IS THE GATED ONE. Writing a recipe used to need
              // Pro outright, which put the app's one authoring feature behind
              // the paywall for somebody who had not decided yet whether they
              // liked the app. Three is enough to keep what you actually cook
              // — the standing pot, the weekday breakfast, the one you make on
              // Sundays — and the ceiling arrives to somebody who has used the
              // feature enough to want a fourth, which is the moment to ask.
              //
              // The database enforces the same three (`recipes_enforce_free_limit`).
              // This is the half that opens the paywall instead of erroring.
              if (quota.atLimit && !requirePro('new_recipe')) return
              router.push('/recipe/edit')
            }}
          >
            <Icon set="ui" name="plus" size={22} tintColor={colors.onPandan} />
          </IconButton>
        }
      />

      <SegmentedControl
        options={SHELVES.map((value) => ({ value, label: t(`recipes:shelf.${value}`) }))}
        value={shelf}
        onChange={(next) => {
          setShelf(next)
          // The query belongs to the shelf that was showing. Carried across, it
          // reads as "no official recipes match" when what happened is that the
          // user changed tab and the field kept a word from the last one.
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

      {/* The skeletons are grouped exactly as the rows are, so the list does
          not reflow from three cards into one when the answer lands. */}
      {loading ? (
        <Card>
          {SKELETON_ROWS.map((id) => (
            <View key={id} className="flex-row items-center gap-3">
              <Skeleton className={ROW_TILE} />
              <View className="flex-1 gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-2/5" />
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {!loading && recipes.length === 0 ? (
        searched ? (
          <EmptyState
            title={t('recipes:search.none')}
            description={t('recipes:search.noneBody')}
            icon={{ set: 'ui', name: 'search' }}
          />
        ) : (
          <EmptyState
            title={t(`recipes:empty.${shelf}Title`)}
            description={t(`recipes:empty.${shelf}Body`)}
            icon={{ set: 'food', name: 'cooking-pot' }}
          />
        )
      ) : null}

      {/* ONE card for the whole shelf, the way the day's entries are one card
          on Today. A card each put 28pt of padding and a slab under every
          recipe, which spread eight of them over three screens and read as
          eight separate things rather than as a list of one kind of thing. */}
      {recipes.length > 0 ? (
        <Card>
          {recipes.map((recipe) => (
            <RecipeRow
              key={recipe.id}
              recipe={recipe}
              onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  )
}
