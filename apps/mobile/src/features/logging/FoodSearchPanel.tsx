import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type TextInput, View } from 'react-native'

import {
  type Entry,
  type Food,
  type Recipe,
  useFoodSearch,
  useRecentFoods,
  useRecipes,
} from '@/data'
import { ItemRow, ROW_TILE } from '@/features/shared'
import { track } from '@/lib/analytics'
import { useDebouncedValue } from '@/lib/use-debounce'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Card, EmptyState, Icon, IconButton, SearchField, Skeleton, Tabs } from '@/ui'
import { whenLabel } from './when'

/**
 * Placeholder rows shown while a search is in flight. Fixed identities rather
 * than `Array.from(...)` with an index key, so React does not reuse a skeleton
 * row as a result row when the data lands.
 */
const SKELETON_ROWS = ['s1', 's2', 's3', 's4', 's5', 's6'] as const

/**
 * How long a settled query has to stay settled before it counts as a search. The
 * catalogue is asked 140ms after a keystroke, which is right for a request and
 * wrong for a measurement: "nas" finding nothing says nothing about the
 * catalogue. A second and a bit is longer than any gap inside a phrase and
 * shorter than the pause before somebody reads the answer.
 */
const SETTLED_MS = 1_200

/**
 * Which list is on screen.
 *
 * `catalogue` is the shared rows behind the Worker. `mine` is the food this
 * account wrote itself, which the database still calls a recipe — the word the
 * user reads is "food" everywhere, and the tables keep their names because a
 * released app is talking to them. `past` is what this account has eaten before.
 *
 * Three lists rather than one merged one, because each is ordered by something
 * different: the catalogue ranks by how well a name matches, your own food by
 * when you wrote it, and the diary by when you ate it.
 */
type Source = 'catalogue' | 'mine' | 'past'

/**
 * Everything a second panel needs to come back looking like the first.
 *
 * The quick selector's inline search does not survive the dish it opens: the
 * sheet is replaced, and `log/search` mounts a fresh panel behind the dish. So
 * `onPick` hands this out and `restore` takes it back.
 *
 * `tracked` is the half that is not on screen. `Food Searched` is sent 1,200ms
 * after a query settles, and a panel that is picked from before then unmounts
 * with the timer still pending, so the search was never recorded. Carrying the
 * answer is what lets the second panel finish the job without doing it twice:
 * without it, seeding always loses the fastest picks and seeding never
 * double-counts the slow ones.
 */
export type FoodSearchState = {
  query: string
  /** Whether `Food Searched` has already been sent for `query`. */
  tracked: boolean
}

export type FoodSearchPanelProps = {
  /**
   * A catalogue dish was chosen; the host decides where that goes. The whole row
   * rather than its id, because the two hosts want different halves: the log
   * sheet routes to a screen that fetches by id, and the ingredient picker needs
   * the macros it is already looking at.
   *
   * The search that found it comes too, and only the quick selector reads it:
   * the sheet leaves as the dish opens, so the state has to travel to the search
   * page that takes its place. See `openPicked` there.
   */
  onPick: (food: Food, search: FoodSearchState) => void
  /**
   * A dish out of this account's own history was chosen. A separate callback
   * rather than a second id, because there is no id to give: `food_id` is null
   * for everything the cascade estimated, and where it is set it is provenance
   * rather than a reference. The entry states its own numbers.
   *
   * Omit it and the Past foods tab is not offered, for the route that reaches
   * this panel from an unreadable snap.
   */
  onPickHistory?: (entry: Entry) => void
  /**
   * One serving of the user's own food, logged outright. Omit it and the My
   * foods tab is not offered — which is what the ingredient picker wants, since
   * a pot is not an ingredient.
   */
  onPickOwn?: (recipe: Recipe) => void
  /**
   * Open one of the user's own foods, for a different number of servings or a
   * look at how it is cooked. Required by the same tab `onPickOwn` turns on.
   */
  onOpenOwn?: (recipe: Recipe) => void
  /**
   * Write a new food. Offered at the head of the My foods tab, because that is
   * where somebody looking for food they have not written yet ends up, and the
   * alternative is closing this sheet and finding the Food tab.
   */
  onCreateOwn?: () => void
  autoFocus?: boolean
  /**
   * Which tab to open on. Only the quick selector passes it, for the widget that
   * still deep-links at the recipe panel this replaced.
   */
  initialSource?: Source
  /**
   * A search handed over by another panel, for a host that is restoring one
   * rather than beginning it. The debounce seeds from the query as well, so
   * something already in the cache draws its results on the first frame instead
   * of a beat of skeletons.
   */
  restore?: FoodSearchState
  /**
   * The search field itself, for a host that has to focus it by hand.
   * `autoFocus` inside a `Modal` is applied while the field is off screen and is
   * routinely dropped, so a sheet has to call `focus()` from `onShow`. The two
   * hosts that are not sheets pass `autoFocus` and nothing else.
   */
  fieldRef?: RefObject<TextInput | null>
}

/**
 * The search: a field, three lists, and what they find.
 *
 * Extracted from the search route, because search is inline in the quick selector
 * now and the route is still reached from a snap that could not be read. Two
 * hosts, and none of the debounce, loading or empty-state behaviour is worth
 * having twice.
 *
 * One field above every tab: the word somebody types is the same word whichever
 * list they meant it for, and a field per tab would lose it on the switch that
 * asks "not in the catalogue, was it something I have eaten?". The catalogue is
 * asked over the network on a debounce; the other two filter as you type.
 *
 * This is the only way in to a food the user wrote themselves, which is why the
 * middle tab exists. It used to be a fourth tile on the log sheet, and a tile
 * that opened its own shelf with its own field made "search for a dish" two
 * different features depending on who had written the dish.
 */
export function FoodSearchPanel({
  onPick,
  onPickHistory,
  onPickOwn,
  onOpenOwn,
  onCreateOwn,
  autoFocus = false,
  initialSource,
  restore,
  fieldRef,
}: FoodSearchPanelProps) {
  const { t } = useTranslation(['logging', 'common'])
  const [query, setQuery] = useState(restore?.query ?? '')

  // Memoised because the strip is a prop on a component that re-renders on
  // every keystroke of the field above it.
  //
  // A tab is offered only where its host can act on a pick. The ingredient
  // picker passes neither callback and gets no strip at all, rather than a
  // strip with one tab on it: a single tab is a label pretending to be a
  // control.
  const tabs = useMemo(
    () => [
      { value: 'catalogue' as const, label: t('logging:search.tabCatalogue') },
      ...(onPickOwn && onOpenOwn
        ? [{ value: 'mine' as const, label: t('logging:search.tabMine') }]
        : []),
      ...(onPickHistory ? [{ value: 'past' as const, label: t('logging:search.tabPast') }] : []),
    ],
    [t, onPickOwn, onOpenOwn, onPickHistory],
  )

  // The opening tab has to be one this host actually offers, or a widget's deep
  // link would select a tab with no list under it.
  const [source, setSource] = useState<Source>(() =>
    initialSource && tabs.some((tab) => tab.value === initialSource) ? initialSource : 'catalogue',
  )

  // The field renders `query` on every keystroke; the catalogue is only asked
  // once typing pauses. See `useDebouncedValue` for why this is a debounce
  // rather than the `useDeferredValue` that was here before.
  const debouncedQuery = useDebouncedValue(query)

  // The Worker ranks rather than only filtering: it fuses an exact name, an
  // exact alias, a full-text and a trigram match over ~48,000 rows, which is why
  // this is a round trip rather than a filter over something the phone holds.
  //
  // Asked only while its own tab is showing. `useFoodSearch('')` answers with an
  // empty list and sends nothing, so typing over your own food does not fire a
  // Worker request per pause for a list nobody is looking at.
  const { data, isFetching, isPaused, isError } = useFoodSearch(
    source === 'catalogue' ? debouncedQuery : '',
  )
  const results = data ?? []

  // Before the first keystroke there is nothing to say. The empty state reads
  // "No dish by that name", which is only true once a name has been typed.
  const searched = debouncedQuery.trim().length > 0

  // Typing again should not leave the previous dishes on screen looking like
  // answers to the new query: the debounced query has not caught up, so the old
  // result set is still "fresh" as far as react-query is concerned.
  const settling = query.trim() !== debouncedQuery.trim()

  /**
   * Exactly one of five things is on screen, and this decides which.
   *
   * The skeletons are gated on `isFetching` rather than `isPending`, which means
   * "this key has no data" and is also true of a query paused for want of a
   * connection: that is how a search showed skeletons that never resolved.
   * `data === undefined` keeps them up only until this query has an answer,
   * including an answer of none.
   *
   * Paused and errored say so rather than borrowing "no dish by that name".
   */
  const state =
    query.trim().length > 0 && (settling || (isFetching && data === undefined))
      ? 'loading'
      : isPaused
        ? 'offline'
        : isError
          ? 'error'
          : searched && results.length === 0
            ? 'empty'
            : 'results'

  /**
   * One event per search, not one per keystroke or prefix.
   *
   * `state` is in the dependency list as well as the query, so a query arriving
   * before its results is not recorded as finding nothing: the timer restarts
   * when `loading` becomes `results`.
   *
   * The last query recorded is remembered, so coming back from a dish does not
   * count as a second search. A restored panel seeds it from the search it was
   * handed, and only when that search was ALREADY sent: the timer above is
   * cleared by the unmount, so a query picked from inside its 1,200ms had not
   * been recorded by anybody, and seeding on the words alone would lose exactly
   * the searches that found their answer fastest.
   *
   * Only the catalogue tab is measured: a filter over the user's own forty rows
   * says nothing about whether the catalogue can be searched.
   */
  const lastTracked = useRef<string | undefined>(
    restore?.tracked ? restore.query.trim() || undefined : undefined,
  )
  useEffect(() => {
    const needle = debouncedQuery.trim()
    if (source !== 'catalogue') return
    if (!needle || (state !== 'results' && state !== 'empty')) return
    if (lastTracked.current === needle) return

    const timer = setTimeout(() => {
      lastTracked.current = needle
      // The text itself is deliberately not sent. What people type and cannot
      // find belongs in the catalogue's own backlog, next to `food_scan_misses`
      // — see the note on `Food Searched` in `lib/analytics/events.ts`.
      track('Food Searched', { results: results.length, query_length: needle.length })
    }, SETTLED_MS)

    return () => clearTimeout(timer)
  }, [debouncedQuery, state, results.length, source])

  return (
    <View className="gap-3">
      <SearchField
        ref={fieldRef}
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery('')}
        clearLabel={t('logging:search.clear')}
        placeholder={t('logging:search.placeholder')}
        autoFocus={autoFocus}
        returnKeyType="search"
      />

      {/* No strip at all with one list, rather than a strip with one tab on it.
          A single tab is a label pretending to be a control. */}
      {tabs.length > 1 ? (
        <Tabs
          align="center"
          options={tabs}
          value={source}
          onChange={setSource}
          accessibilityLabel={t('logging:search.tabs')}
        />
      ) : null}

      {source === 'past' && onPickHistory ? (
        <HistoryList query={query} onPick={onPickHistory} />
      ) : source === 'mine' && onPickOwn && onOpenOwn ? (
        <OwnFoodList
          query={debouncedQuery}
          onPick={onPickOwn}
          onOpen={onOpenOwn}
          onCreate={onCreateOwn}
        />
      ) : (
        <>
          {state === 'loading' ? (
            <View className="gap-3" accessibilityRole="progressbar">
              {SKELETON_ROWS.map((id) => (
                // Shaped like the row it replaces — a tile, two lines of text and a
                // trailing number — so the list does not jump when the results
                // land. The tile is part of that shape now: these rows were text
                // only while a catalogue drawing was rare, and are not any more.
                <Card key={id}>
                  <View className="flex-row items-center gap-3">
                    <Skeleton className={ROW_TILE} />
                    <View className="flex-1 gap-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-2/5" />
                    </View>
                    <Skeleton className="h-6 w-12" />
                  </View>
                </Card>
              ))}
            </View>
          ) : null}

          {state === 'offline' ? (
            <EmptyState
              title={t('logging:search.offlineTitle')}
              description={t('logging:search.offlineBody')}
              icon={{ set: 'ui', name: 'offline' }}
            />
          ) : null}

          {state === 'error' ? (
            <EmptyState
              title={t('logging:search.errorTitle')}
              description={t('logging:search.errorBody')}
              icon={{ set: 'ui', name: 'warning' }}
            />
          ) : null}

          {state === 'empty' ? (
            <EmptyState
              title={t('logging:search.emptyTitle')}
              description={t('logging:search.emptyBody')}
              icon={{ set: 'ui', name: 'search' }}
            />
          ) : null}

          {state === 'results' &&
            results.map((food, index) => (
              <Card key={food.id}>
                <ItemRow
                  title={food.name}
                  // The drawing the catalogue carries, and the empty plate when
                  // it has none. These rows were text only when coverage was 35%
                  // and a column of mostly-empty tiles indented every dish name.
                  // `icon-match.ts` took it to 73.5%, so the blank is now the
                  // exception.
                  icon={food.icon}
                  value={food.macros.kcal}
                  unit={t('common:unit.kcal')}
                  detail={`${t(`logging:search.place.${food.place}`)} · ${food.servingLabel}`}
                  onPress={() => {
                    // 1-based rank, which is the live version of what
                    // `pnpm foods:gate` grades against thirty fixed queries: a
                    // ranking that is working puts most picks at position one.
                    track('Food Picked', { position: index + 1, results: results.length })
                    onPick(food, { query, tracked: lastTracked.current === query.trim() })
                  }}
                />
              </Card>
            ))}
        </>
      )}
    </View>
  )
}

/**
 * The food this account wrote itself, newest first.
 *
 * A pot the user entered once: what went in and how many it feeds. The database
 * calls one a recipe and so does every hook below, because a released app is
 * talking to those tables; the word on screen is "food".
 *
 * Living in this file rather than in `features/recipes` is deliberate.
 * `IngredientSheet` imports this panel, so a panel that imported the recipe
 * feature back would be a cycle.
 *
 * The plus logs one serving outright and the row opens the food, which is the
 * same split the shelf makes: how many servings is a question with an answer
 * screen, and "one, the way I always have it" should not need it.
 */
function OwnFoodList({
  query,
  onPick,
  onOpen,
  onCreate,
}: {
  query: string
  onPick: (recipe: Recipe) => void
  onOpen: (recipe: Recipe) => void
  onCreate?: () => void
}) {
  const { t } = useTranslation(['logging', 'recipes', 'common'])
  const colors = useThemeColors()
  const { data: recipes = [], isPending, isPaused, isError } = useRecipes('mine', query)

  const searched = query.trim().length > 0

  /**
   * ABOVE the list rather than inside the empty state, and that is the keyboard
   * rather than a preference. This panel takes the keyboard on open, which
   * leaves about half the sheet, and a button under an illustration and two
   * lines of explanation sits below the fold — the one control on the one tab
   * whose whole job is "you have not written any yet".
   *
   * Hidden while a search is running, where the field is the thing being used
   * and every row on screen is an answer to it.
   *
   * The form's own title is the label, so this button and the heading it opens
   * are the same words.
   */
  const create =
    onCreate && !searched ? (
      <Button variant="secondary" fullWidth onPress={onCreate}>
        {t('recipes:new.title')}
      </Button>
    ) : null

  // `isPending` and not `isFetching`, as the history list has it: this list is
  // worth showing while it refreshes, and only a first load has nothing to draw.
  if (isPending && !isPaused) {
    return (
      <>
        {create}
        <View className="gap-3" accessibilityRole="progressbar">
          {SKELETON_ROWS.map((id) => (
            <Card key={id}>
              <View className="flex-row items-center gap-3">
                <Skeleton className={ROW_TILE} />
                <View className="flex-1 gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-2/5" />
                </View>
                <Skeleton className="h-6 w-12" />
              </View>
            </Card>
          ))}
        </View>
      </>
    )
  }

  if (isPaused && recipes.length === 0) {
    return (
      <EmptyState
        title={t('logging:search.offlineTitle')}
        description={t('logging:search.mineOfflineBody')}
        icon={{ set: 'ui', name: 'offline' }}
      />
    )
  }

  if (isError && recipes.length === 0) {
    return (
      <EmptyState
        title={t('logging:search.errorTitle')}
        description={t('logging:search.errorBody')}
        icon={{ set: 'ui', name: 'warning' }}
      />
    )
  }

  if (recipes.length === 0) {
    // Two different nothings, the same split the history list makes. An account
    // that has written nothing is being told what this list is for, above a
    // button that opens the form; one whose search matched nothing is being told
    // to try fewer letters, and offering it a blank form would answer a question
    // it did not ask.
    return searched ? (
      <EmptyState
        title={t('logging:search.emptyTitle')}
        description={t('logging:search.mineNoMatchBody')}
        icon={{ set: 'ui', name: 'search' }}
      />
    ) : (
      <>
        {create}
        <EmptyState
          title={t('logging:search.mineEmptyTitle')}
          description={t('logging:search.mineEmptyBody')}
          icon={{ set: 'food', name: 'cooking-pot' }}
        />
      </>
    )
  }

  return (
    <>
      {create}
      {recipes.map((recipe, index) => (
        <Card key={recipe.id}>
          <ItemRow
            title={recipe.name}
            icon={recipe.icon}
            photoPath={recipe.photoPath}
            // What one serving costs, which is what the plus beside it writes.
            value={recipe.perServing.kcal}
            unit={t('common:unit.kcal')}
            detail={t('recipes:servings', { count: recipe.servings })}
            onPress={() => onOpen(recipe)}
            trailing={
              <IconButton
                size="sm"
                variant="primary"
                accessibilityLabel={`${t('common:action.add')}, ${recipe.name}`}
                onPress={() => {
                  track('Food Picked', {
                    position: index + 1,
                    results: recipes.length,
                    source: 'recipe',
                  })
                  onPick(recipe)
                }}
              >
                <Icon set="ui" name="plus" size={18} tintColor={colors.onPandan} />
              </IconButton>
            }
          />
        </Card>
      ))}
    </>
  )
}

/**
 * What this account has eaten before, newest first.
 *
 * Filtered on the phone rather than over the network, so it narrows on the
 * keystroke instead of a debounce and there is no paused or errored state to draw
 * for a filter over an array.
 *
 * The rows carry their own picture, which is most of the point of this tab: a
 * meal somebody photographed is recognisable from six weeks away in a way its
 * name is not.
 */
function HistoryList({ query, onPick }: { query: string; onPick: (entry: Entry) => void }) {
  const { t } = useTranslation(['logging', 'common'])
  const { data, isPending, isPaused, isError } = useRecentFoods()

  const named = useMemo(
    () => ({ today: t('common:date.today'), yesterday: t('common:date.yesterday') }),
    [t],
  )

  const needle = query.trim().toLowerCase()
  const shown = (data ?? []).filter(
    (entry) =>
      !needle ||
      entry.foodName.toLowerCase().includes(needle) ||
      (entry.brand?.toLowerCase().includes(needle) ?? false),
  )

  // `isPending` and not `isFetching`: this list is worth showing while it
  // refreshes in the background, and only a first load has nothing to draw.
  // Paused is checked first for the reason the catalogue side gives — a list
  // that could not be fetched is not an empty history.
  if (isPending && !isPaused) {
    return (
      <View className="gap-3" accessibilityRole="progressbar">
        {SKELETON_ROWS.map((id) => (
          <Card key={id}>
            <View className="flex-row items-center gap-3">
              <Skeleton className={ROW_TILE} />
              <View className="flex-1 gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-2/5" />
              </View>
              <Skeleton className="h-6 w-12" />
            </View>
          </Card>
        ))}
      </View>
    )
  }

  if (isPaused && !data) {
    return (
      <EmptyState
        title={t('logging:search.offlineTitle')}
        description={t('logging:search.pastOfflineBody')}
        icon={{ set: 'ui', name: 'offline' }}
      />
    )
  }

  if (isError && !data) {
    return (
      <EmptyState
        title={t('logging:search.errorTitle')}
        description={t('logging:search.errorBody')}
        icon={{ set: 'ui', name: 'warning' }}
      />
    )
  }

  if (shown.length === 0) {
    // Two different nothings. An account with no history is being told how this
    // list fills up; one whose search matched nothing is being told to try
    // fewer letters, and telling it about logging meals would be absurd.
    return needle ? (
      <EmptyState
        title={t('logging:search.emptyTitle')}
        description={t('logging:search.pastNoMatchBody')}
        icon={{ set: 'ui', name: 'search' }}
      />
    ) : (
      <EmptyState
        title={t('logging:search.pastEmptyTitle')}
        description={t('logging:search.pastEmptyBody')}
        icon={{ set: 'food', name: 'empty-plate' }}
      />
    )
  }

  return (
    <>
      {shown.map((entry, index) => (
        <Card key={entry.id}>
          <ItemRow
            title={entry.foodName}
            icon={entry.icon}
            photoPath={entry.photoPath}
            value={entry.macros.kcal}
            unit={t('common:unit.kcal')}
            // WHEN, and only when. The portion is on the row it came from and
            // will be on the row this writes, and what somebody is picking out
            // of their own history is the meal they remember having — which is
            // a thing that happened at a time, not a serving size.
            detail={whenLabel(entry.loggedAt, named)}
            onPress={() => {
              track('Food Picked', {
                position: index + 1,
                results: shown.length,
                source: 'history',
              })
              onPick(entry)
            }}
          />
        </Card>
      ))}
    </>
  )
}
