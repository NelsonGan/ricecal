import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, type TextInputInstance, View } from 'react-native'

import { type Recipe, type RecipeShelf, useRecipeQuota, useRecipes } from '@/data'
import { useRequirePro } from '@/features/paywall'
import {
  AddRecipeCard,
  RecipeCard,
  type RecipeStart,
  useLogRecipe,
  useRecipeLogDate,
} from '@/features/recipes'
import { ScreenTitle } from '@/features/shared'
import { useDebouncedValue } from '@/lib/use-debounce'
import { useThemeColors } from '@/theme/useTheme'
import { EmptyState, Icon, IconButton, Screen, SearchField, SegmentedControl, Skeleton } from '@/ui'

const SHELVES: RecipeShelf[] = ['mine', 'community']

const SKELETON_CARDS = ['c1', 'c2', 'c3', 'c4'] as const

/** How many recipes your shelf holds before the Add card steps aside. */
const ADD_CARD_UNTIL = 4

/**
 * The Recipes tab: everything this account cooks, and what other people share.
 *
 * It used to be "My foods", a row in Settings, and it was a shelf of tiles with a
 * calorie figure under each. People who cook asked for a recipe box, so the tab
 * reads like one: the picture and the time first (the meta line under each
 * card), the three ways to write one in at the top of your own shelf, and the
 * one-tap log still on every card, because logging what you cooked is what the
 * rest of the app is for.
 *
 * There was a row of filter chips (favourites, under 30 minutes, meal tags)
 * under the shelf control. It made the top of the tab busy for a shelf most
 * people keep short, and search already narrows it, so it went.
 */
export default function RecipesTab() {
  const { t } = useTranslation(['recipes', 'common'])
  const router = useRouter()
  const requirePro = useRequirePro()
  const quota = useRecipeQuota()
  const colors = useThemeColors()
  // Today, not the diary's selected day: see `useRecipeLogDate`.
  const { logDate } = useRecipeLogDate()
  const { log } = useLogRecipe()

  const [shelf, setShelf] = useState<RecipeShelf>('mine')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchField = useRef<TextInputInstance>(null)
  const debounced = useDebouncedValue(query)
  // Closing search restores the whole shelf at once, without waiting for the
  // debounce to catch up with a field that is no longer on screen.
  const activeQuery = searchOpen && query.trim().length > 0 ? debounced : ''

  const { data: recipes = [], isPending } = useRecipes(shelf, activeQuery)

  // Only while this shelf has never answered. A background refetch
  // keeps what is on screen, an empty answer included, so logging from a card
  // does not blink the grid into skeletons and back.
  const loading = isPending
  const searched = activeQuery.trim().length > 0
  /**
   * The three ways in, while your shelf is still short. Past a few recipes it
   * was most of the first screen on every visit, and the plus in the bar opens
   * the same three choices.
   */
  const showAdd = shelf === 'mine' && !searched && !loading && recipes.length < ADD_CARD_UNTIL

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

  /**
   * A new recipe, through whichever door. The database enforces the free
   * ceiling too (`recipes_enforce_free_limit`); this is the half that opens the
   * paywall instead of a form that cannot be saved. Reading a pot is Pro, and
   * asking here keeps the paywall on this screen rather than over an empty form.
   */
  const startNew = (start?: RecipeStart) => {
    if (quota.atLimit && !requirePro('new_recipe')) return
    if ((start === 'photo' || start === 'describe') && !requirePro('read_recipe')) return
    router.push({ pathname: '/recipe/edit', params: start ? { start } : {} })
  }

  /**
   * One serving, into today. Not gated, for the reason the detail screen gives:
   * logging a pot reaches no model and costs nothing. `useLogRecipe` offers the
   * undo, which matters on a plus this easy to reach.
   */
  const logOne = (recipe: Recipe) => log(recipe, 1, logDate)

  return (
    <Screen>
      <ScreenTitle
        title={t('recipes:title')}
        trailing={
          <View className="flex-row items-center gap-2">
            <IconButton
              variant="primary"
              size="sm"
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
              accessibilityLabel={t('recipes:new.title')}
              onPress={() => startNew()}
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
          // The query belongs to the shelf that was showing. Carried across,
          // "nothing matches" reads as an empty community when what happened
          // is a word left over from the other shelf.
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

      {showAdd ? (
        <AddRecipeCard
          onStart={startNew}
          free={quota.limit != null ? { used: quota.count, limit: quota.limit } : undefined}
        />
      ) : null}

      {/* The wait holds the grid's two-column shape, so the answer landing does
          not jump a stack of rows into wide cards. */}
      {loading ? (
        <View className="flex-row flex-wrap justify-between gap-y-4">
          {SKELETON_CARDS.map((id) => (
            <View key={id} className="w-[48%] gap-2">
              <View className="aspect-[4/3] overflow-hidden rounded-tile">
                <Skeleton width="100%" height="100%" rounded={false} className="bg-line" />
              </View>
              <Skeleton width="80%" height={16} />
              <Skeleton width="55%" height={12} />
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
        ) : showAdd ? null : (
          // Your own empty shelf has the Add card above, which already says
          // everything an empty state would.
          <EmptyState
            title={t('recipes:empty.communityTitle')}
            description={t('recipes:empty.communityBody')}
            icon={{ set: 'food', name: 'cooking-pot' }}
          />
        )
      ) : null}

      {recipes.length > 0 ? (
        <View className="flex-row flex-wrap justify-between gap-y-5">
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
              onLog={() => logOne(recipe)}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  )
}
