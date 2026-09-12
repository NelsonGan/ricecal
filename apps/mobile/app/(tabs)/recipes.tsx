import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, type TextInput, View } from 'react-native'

import { type RecipeShelf, useRecipeQuota, useRecipes } from '@/data'
import { useRequirePro } from '@/features/paywall'
import { RecipeTile } from '@/features/recipes'
import { ScreenTitle } from '@/features/shared'
import { useDebouncedValue } from '@/lib/use-debounce'
import { useThemeColors } from '@/theme/useTheme'
import { EmptyState, Icon, IconButton, Screen, SearchField, SegmentedControl, Skeleton } from '@/ui'

const SHELVES: RecipeShelf[] = ['mine', 'community']

const SKELETON_TILES = ['t1', 't2', 't3', 't4', 't5', 't6'] as const
const GRID_FILLERS = ['first', 'second'] as const

/**
 * The two shelves of food people write, and the Food tab.
 *
 * One screen and not two, because they are one list read two ways: the same row,
 * the same tap target, the same numbers. What changes is who wrote the food, and
 * the segmented control says which is showing.
 *
 * There was a third, the RiceCal kitchen: rows with no owner at all. Nothing was
 * ever put on it, and a permanently empty shelf is a tab that teaches people the
 * app has nothing.
 *
 * A root screen, so it carries a `ScreenTitle` rather than an `AppBar`. The
 * heading changes with the shelf, unlike the other tabs' titles: "My foods" and
 * "Community" are different places.
 */
export default function RecipesScreen() {
  const { t } = useTranslation(['recipes', 'common'])
  const router = useRouter()
  const requirePro = useRequirePro()
  const quota = useRecipeQuota()
  const colors = useThemeColors()

  const [shelf, setShelf] = useState<RecipeShelf>('mine')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchField = useRef<TextInput>(null)
  const debounced = useDebouncedValue(query)
  // Closing search restores the whole shelf immediately, without waiting for
  // the debounced value to catch up while the field is no longer visible.
  // An empty live field wins over the trailing debounce. Without this, closing
  // and immediately reopening search could show the previous result under an
  // empty input until the debounce caught up.
  const activeQuery = searchOpen && query.trim().length > 0 ? debounced : ''

  const { data: recipes = [], isFetching } = useRecipes(shelf, activeQuery)

  // Only while there is nothing to show. Skeletons over a list that already has
  // rows in it makes a refetch look like a reload.
  const loading = isFetching && recipes.length === 0
  const searched = activeQuery.trim().length > 0
  const gridFillers = (3 - (recipes.length % 3)) % 3

  const toggleSearch = () => {
    if (!searchOpen) {
      setSearchOpen(true)
      return
    }

    searchField.current?.blur()
    Keyboard.dismiss()
    setQuery('')
    setSearchOpen(false)
  }

  return (
    <Screen>
      <ScreenTitle
        title={t(`recipes:heading.${shelf}`)}
        trailing={
          <View className="flex-row items-center gap-2">
            <IconButton
              variant="primary"
              size="sm"
              className="self-center"
              accessibilityLabel={
                searchOpen ? t('common:action.close') : t(`recipes:search.${shelf}`)
              }
              accessibilityState={{ expanded: searchOpen }}
              onPress={toggleSearch}
            >
              <Icon
                set="ui"
                name={searchOpen ? 'close' : 'search'}
                size={20}
                // Search is a shaded illustration, so a flat tint erases the
                // lens and handle. Close is a single-colour control glyph.
                tintColor={searchOpen ? colors.onPandan : undefined}
              />
            </IconButton>

            <IconButton
              variant="primary"
              size="sm"
              className="self-center"
              accessibilityLabel={t('recipes:new.title')}
              onPress={() => {
                // The database enforces the same three (`recipes_enforce_free_limit`).
                // This is the half that opens the paywall instead of erroring.
                if (quota.atLimit && !requirePro('new_recipe')) return
                router.push('/recipe/edit')
              }}
            >
              <Icon set="ui" name="plus" size={20} tintColor={colors.onPandan} />
            </IconButton>
          </View>
        }
      />

      <SegmentedControl
        options={SHELVES.map((value) => ({ value, label: t(`recipes:shelf.${value}`) }))}
        value={shelf}
        onChange={(next) => {
          setShelf(next)
          // The query belongs to the shelf that was showing. Carried across, it
          // reads as "nothing in the community matches" when what happened is
          // that the user changed tab and the field kept a word from the last
          // one.
          setQuery('')
        }}
      />

      {searchOpen ? (
        <SearchField
          ref={searchField}
          autoFocus
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          clearLabel={t('recipes:search.clear')}
          placeholder={t(`recipes:search.${shelf}`)}
          returnKeyType="search"
        />
      ) : null}

      {/* The wait holds the gallery's exact three-column shape. A stack of row
          skeletons would jump into wide image tiles when the answer lands. */}
      {loading ? (
        <View className="flex-row flex-wrap justify-between gap-y-4">
          {SKELETON_TILES.map((id) => (
            <View key={id} className="w-[31%] gap-2">
              <View className="aspect-square overflow-hidden rounded-tile">
                <Skeleton width="100%" height="100%" rounded={false} className="bg-line" />
              </View>
              <Skeleton width="80%" height={14} />
            </View>
          ))}
        </View>
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
            icon={{ set: 'food', name: 'cooking-pot' }}
          />
        )
      ) : null}

      {/* A gallery rather than rows: the food's picture is the quickest way to
          find it again, and three columns leave it large without making the shelf
          one very long screen. */}
      {recipes.length > 0 ? (
        <View className="flex-row flex-wrap justify-between gap-y-4">
          {recipes.map((recipe) => (
            <RecipeTile
              key={recipe.id}
              recipe={recipe}
              onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
            />
          ))}
          {/* `justify-between` gives the three columns fluid gutters. Invisible
              cells keep an incomplete last row in those same columns instead
              of stretching two foods to opposite edges. */}
          {GRID_FILLERS.slice(0, gridFillers).map((id) => (
            <View key={id} testID="recipe-grid-filler" className="w-[31%]" />
          ))}
        </View>
      ) : null}
    </Screen>
  )
}
