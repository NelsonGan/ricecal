import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, type TextInputInstance, View } from 'react-native'

import {
  type Recipe,
  type RecipeShelf,
  useRecipeQuota,
  useRecipes,
  useVideoImportQuota,
} from '@/data'
import { openPaywall, proFeatureTitle } from '@/data/refusals'
import { InlineCamera } from '@/features/logging'
import { useRequirePro } from '@/features/paywall'
import {
  AddRecipeTiles,
  DescribeRecipePanel,
  ImportVideoPanel,
  RecipeCard,
  type RecipeStart,
  stageRecipeRead,
  useLogRecipe,
  useRecipeLogDate,
} from '@/features/recipes'
import { ScreenTitle } from '@/features/shared'
import { useDebouncedValue } from '@/lib/use-debounce'
import { useThemeColors } from '@/theme/useTheme'
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  SearchField,
  SegmentedControl,
  Sheet,
  Skeleton,
  Text,
  useToast,
} from '@/ui'

const SHELVES: RecipeShelf[] = ['mine', 'community']

const SKELETON_CARDS = ['c1', 'c2', 'c3', 'c4'] as const

/**
 * The Recipes tab: everything this account cooks, and what other people share.
 *
 * It used to be "My foods", a row in Settings, and it was a shelf of tiles with a
 * calorie figure under each. People who cook asked for a recipe box, so the tab
 * reads like one: the picture and the time first (the meta line under each
 * card), the plus button opening the three ways to add a recipe in a sheet, and
 * the one-tap log still on every card, because logging what you cooked is what
 * the rest of the app is for.
 *
 * There was a row of filter chips (favourites, under 30 minutes, meal tags)
 * under the shelf control. It made the top of the tab busy for a shelf most
 * people keep short, and search already narrows it, so it went.
 */
export default function RecipesTab() {
  const { t } = useTranslation(['recipes', 'common', 'paywall'])
  const router = useRouter()
  const requirePro = useRequirePro()
  const quota = useRecipeQuota()
  const imports = useVideoImportQuota()
  const toast = useToast()
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

  const [addOpen, setAddOpen] = useState(false)
  const [camera, setCamera] = useState(false)
  const [describing, setDescribing] = useState(false)
  const [importing, setImporting] = useState(false)
  // The describe sheet has actually been presented. `autoFocus` inside a
  // `Modal` is applied while the field is still off screen and routinely
  // dropped, so the field waits for `onShow` rather than for `visible`.
  const [describeReady, setDescribeReady] = useState(false)
  // Queued work to run once the closing sheet's native Modal is gone. On iOS,
  // opening a second sheet or pushing a route while a modal is still dismissing
  // can be silently dropped.
  const afterSheet = useRef<(() => void) | null>(null)
  const flushAfterSheet = () => {
    const next = afterSheet.current
    afterSheet.current = null
    next?.()
  }

  const { data: recipes = [], isPending } = useRecipes(shelf, activeQuery)

  // Only while this shelf has never answered. A background refetch
  // keeps what is on screen, an empty answer included, so logging from a card
  // does not blink the grid into skeletons and back.
  const loading = isPending
  const searched = activeQuery.trim().length > 0
  // Not while the entitlement is still loading: until it lands every account
  // looks free, and a Pro user saw "0 of 3 free" flash past.
  const freeQuota =
    !quota.loading && quota.limit != null ? { used: quota.count, limit: quota.limit } : undefined

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
   *
   * Photo and Describe open their sheets over this tab so backing out lands
   * right back on the index page rather than on a separate chooser screen.
   */
  const startNew = (start: RecipeStart) => {
    // A video import is its own allowance and never counts against the
    // recipes kept, so the kept-recipe ceiling does not stand in front of it.
    if (start === 'video') {
      const left = imports.data
      if (left && !left.entitled && left.remaining <= 0) {
        openPaywall(toast, { title: proFeatureTitle('video_import'), feature: 'video_import' })
        return
      }
      Keyboard.dismiss()
      setImporting(true)
      return
    }
    if (quota.atLimit && !requirePro('new_recipe')) return
    if (start === 'manual') {
      router.push('/recipe/edit')
      return
    }
    if (!requirePro('read_recipe')) return
    Keyboard.dismiss()
    if (start === 'photo') setCamera(true)
    else setDescribing(true)
  }

  // Not gated on the kept-recipe ceiling any more: the sheet also holds Video,
  // which a free account at three recipes can still use. The other three tiles
  // ask in `startNew`.
  const openAddSheet = () => {
    Keyboard.dismiss()
    setAddOpen(true)
  }

  const chooseFromSheet = (start: RecipeStart) => {
    if (!addOpen) return
    afterSheet.current = () => startNew(start)
    setAddOpen(false)
  }

  const capturePhoto = (uri: string | undefined) => {
    if (!camera) return
    if (uri) {
      afterSheet.current = () => {
        stageRecipeRead({ kind: 'photo', uri })
        router.push({ pathname: '/recipe/edit', params: { read: '1' } })
      }
    }
    setCamera(false)
  }

  const submitDescription = (described: string) => {
    if (!describing) return
    afterSheet.current = () => {
      stageRecipeRead({ kind: 'text', text: described })
      router.push({ pathname: '/recipe/edit', params: { read: '1' } })
    }
    setDescribing(false)
  }

  const submitVideo = (url: string) => {
    if (!importing) return
    afterSheet.current = () => router.push({ pathname: '/recipe/import', params: { url } })
    setImporting(false)
  }

  // Free accounts only: Pro's ceiling is an abuse limit and is never printed.
  const importsLeft = imports.data && !imports.data.entitled ? imports.data.remaining : undefined

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
              onPress={openAddSheet}
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
        ) : shelf === 'mine' ? (
          <EmptyState
            title={t('recipes:empty.mineTitle')}
            description={t('recipes:empty.mineBody')}
            icon={{ set: 'food', name: 'cooking-pot' }}
            action={<Button onPress={openAddSheet}>{t('recipes:add.title')}</Button>}
          />
        ) : (
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

      <Sheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onDismiss={flushAfterSheet}
        title={t('recipes:add.title')}
        titleAction={
          freeQuota ? (
            <Text variant="caption">
              {t('recipes:add.quota', {
                used: Math.min(freeQuota.used, freeQuota.limit),
                count: freeQuota.limit,
              })}
            </Text>
          ) : undefined
        }
        closeLabel={t('common:action.close')}
        scrollable={false}
      >
        <AddRecipeTiles
          onStart={chooseFromSheet}
          proBadge={freeQuota ? t('paywall:table.pro') : undefined}
        />
      </Sheet>

      <Sheet
        visible={camera}
        onClose={() => setCamera(false)}
        onDismiss={flushAfterSheet}
        title={t('recipes:new.scanTitle')}
        closeLabel={t('common:action.close')}
        // Full height with the camera filling it, as every camera in the app
        // does. A recipe card or a page of a cookbook is small print, and the
        // 310pt box this used to be made it smaller still.
        fullHeight
        fillBody
        scrollable={false}
      >
        <InlineCamera fill onCapture={capturePhoto} />
      </Sheet>

      <Sheet
        visible={describing}
        onClose={() => setDescribing(false)}
        onDismiss={() => {
          setDescribeReady(false)
          flushAfterSheet()
        }}
        title={t('recipes:new.describeTitle')}
        closeLabel={t('common:action.close')}
        fullHeight
        scrollable={false}
        onShow={() => setDescribeReady(true)}
      >
        {describeReady ? <DescribeRecipePanel autoFocus onSubmit={submitDescription} /> : null}
      </Sheet>

      <Sheet
        visible={importing}
        onClose={() => setImporting(false)}
        onDismiss={flushAfterSheet}
        title={t('recipes:import.title')}
        titleAction={
          importsLeft !== undefined ? (
            <Text variant="caption">{t('recipes:import.left', { count: importsLeft })}</Text>
          ) : undefined
        }
        closeLabel={t('common:action.close')}
        scrollable={false}
      >
        <ImportVideoPanel onSubmit={submitVideo} />
      </Sheet>
    </Screen>
  )
}
