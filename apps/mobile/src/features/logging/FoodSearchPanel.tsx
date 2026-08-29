import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type TextInput, View } from 'react-native'

import { type Entry, type Food, useFoodSearch, useRecentFoods } from '@/data'
import { ItemRow, ROW_TILE } from '@/features/shared'
import { track } from '@/lib/analytics'
import { useDebouncedValue } from '@/lib/use-debounce'
import { Card, EmptyState, SearchField, Skeleton, Tabs } from '@/ui'
import { whenLabel } from './when'

/**
 * Placeholder rows shown while a search is in flight.
 *
 * Fixed identities rather than `Array.from(...)` with an index key: these never
 * reorder, and a stable key is what stops React reusing a skeleton row as a
 * result row when the data lands.
 */
const SKELETON_ROWS = ['s1', 's2', 's3', 's4', 's5', 's6'] as const

/**
 * How long a settled query has to stay settled before it counts as a search.
 *
 * The catalogue is asked 140ms after a keystroke, which is the right delay for
 * a request and the wrong one for a MEASUREMENT: typing "nasi lemak" would
 * report three or four searches, most of them prefixes, and "nas" finding
 * nothing says nothing at all about the catalogue. A second and a bit is longer
 * than any gap inside a phrase and shorter than the pause before somebody reads
 * the answer, so what gets recorded is the query they stopped at.
 */
const SETTLED_MS = 1_200

/**
 * Which list is on screen.
 *
 * `catalogue` is the shared 48,000 rows behind the Worker; `mine` is what this
 * account has eaten before. They are tabs rather than one merged list because
 * they answer different questions and rank on different things — the catalogue
 * ranks by how well a name matches, and a history ranks by when.
 */
type Source = 'catalogue' | 'mine'

export type FoodSearchPanelProps = {
  /**
   * A catalogue dish was chosen. The host decides where that goes.
   *
   * The whole row rather than its id, because the two hosts want different
   * halves of it: the log sheet routes to a screen that will fetch the food
   * again by id, and the ingredient picker needs the macros it is already
   * looking at — asking for them a second time would be a round trip to
   * redisplay a number that is on screen.
   */
  onPick: (food: Food) => void
  /**
   * A dish out of this account's own history was chosen.
   *
   * A separate callback rather than a second id, because there is no id to give:
   * an entry's `food_id` is null for everything the cascade estimated, and even
   * where it is set it is provenance rather than a reference — repricing the
   * meal from the catalogue row it names is the bug `withCataloguePortions`
   * exists to stop. The entry states its own numbers, so the entry is what gets
   * handed over.
   *
   * Omit it and there are no tabs and no second list: the route that reaches
   * this panel from an unreadable snap has nowhere to put an entry.
   */
  onPickHistory?: (entry: Entry) => void
  autoFocus?: boolean
  /**
   * The search field itself, for a host that has to focus it by hand.
   *
   * `autoFocus` inside a `Modal` is applied while the field is still off screen
   * and is routinely dropped, so a sheet wanting the keyboard up has to call
   * `focus()` from `onShow` — see `Sheet`. The two hosts that are not sheets
   * pass `autoFocus` and nothing else.
   */
  fieldRef?: RefObject<TextInput | null>
}

/**
 * The search: a field, two lists, and what they find.
 *
 * Extracted from the search route because search is inline in the quick selector
 * now, and the route is still reached from a snap that could not be read ("fix it
 * by typing"). Two hosts, and none of the interesting behaviour — the debounce,
 * what counts as loading, the empty states — is worth having twice.
 *
 * ONE FIELD ABOVE BOTH TABS, and that is the decision the layout turns on. The
 * word somebody types is the same word whichever list they meant it for, and a
 * field per tab would lose it on every switch — which is exactly the moment it
 * is wanted, since "not in the catalogue, was it something I have eaten?" is the
 * question the second tab answers. The catalogue is asked over the network on a
 * debounce; the history is already on the phone and filters as you type.
 */
export function FoodSearchPanel({
  onPick,
  onPickHistory,
  autoFocus = false,
  fieldRef,
}: FoodSearchPanelProps) {
  const { t } = useTranslation(['logging', 'common'])
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<Source>('catalogue')

  // The field renders `query` on every keystroke; the catalogue is only asked
  // once typing pauses. See `useDebouncedValue` for why this is a debounce
  // rather than the `useDeferredValue` that was here before.
  const debouncedQuery = useDebouncedValue(query)

  // The Worker does the ranking, not just the filtering: it fuses an exact
  // name, an exact alias, a full-text and a trigram match over ~48,000
  // searchable rows. Ranking is the whole reason this is a round trip and not
  // a filter over something the phone holds.
  //
  // ASKED ONLY WHILE ITS OWN TAB IS SHOWING. `useFoodSearch('')` answers with an
  // empty list and sends nothing, so somebody typing over their own history is
  // not also firing a Worker request per pause for a list nobody is looking at.
  // Coming back to this tab starts the request then, or serves the cached answer
  // if the same words were searched a moment ago.
  const { data, isFetching, isPaused, isError } = useFoodSearch(
    source === 'catalogue' ? debouncedQuery : '',
  )
  const results = data ?? []

  // Memoised because the strip is a prop on a component that re-renders on
  // every keystroke of the field above it.
  const tabs = useMemo(
    () => [
      { value: 'catalogue' as const, label: t('logging:search.tabCatalogue') },
      { value: 'mine' as const, label: t('logging:search.tabMine') },
    ],
    [t],
  )

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
   * The skeletons are gated on `isFetching`, not on the `isPending` that was here
   * before. `isPending` means "this key has no data", which is also true of a
   * query that is not fetching at all — one paused for want of a connection,
   * which is how a search with no results showed skeletons
   * that never resolved into anything. `isFetching` is about a request being in
   * flight, so it cannot get stuck; and `data === undefined` keeps them up only
   * until THIS query has an answer, including an answer of none.
   *
   * Paused and errored say so rather than borrowing "no dish by that name". A
   * search that could not run is not a search that found nothing.
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
   * One event per search, not one per keystroke and not one per prefix.
   *
   * `state` is in the dependency list as well as the query, so a query that
   * arrives before its results does not get recorded as finding nothing — the
   * timer restarts when `loading` becomes `results`.
   *
   * The last query recorded is remembered so that coming back from a dish and
   * re-rendering over the same results does not count as a second search.
   *
   * Only the catalogue tab is measured. What this answers is whether the
   * catalogue can be searched successfully, and a filter over the user's own
   * forty rows says nothing about that.
   */
  const lastTracked = useRef<string | undefined>(undefined)
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
      {onPickHistory ? (
        <Tabs
          align="center"
          options={tabs}
          value={source}
          onChange={setSource}
          accessibilityLabel={t('logging:search.tabs')}
        />
      ) : null}

      {source === 'mine' && onPickHistory ? (
        <HistoryList query={query} onPick={onPickHistory} />
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
                  // The drawing the catalogue carries, and the empty plate when it
                  // has none. These rows were TEXT ONLY on the reasoning that art
                  // was the rare exception — true at 35% coverage, when a column of
                  // mostly-empty tiles indented every dish name for the sake of the
                  // few that had one. `icon-match.ts` took that to 73.5%, so the
                  // majority row now has a picture and the exception is the blank.
                  icon={food.icon}
                  value={food.macros.kcal}
                  unit={t('common:unit.kcal')}
                  detail={`${t(`logging:search.place.${food.place}`)} · ${food.servingLabel}`}
                  onPress={() => {
                    // 1-based rank, which is the live version of what
                    // `pnpm foods:gate` grades against thirty fixed queries: a
                    // ranking that is working puts most picks at position one.
                    track('Food Picked', { position: index + 1, results: results.length })
                    onPick(food)
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
 * WHAT THIS ACCOUNT HAS EATEN BEFORE, newest first.
 *
 * Filtered on the phone rather than over the network, which is the difference
 * that decides how this behaves: the whole list is already here, so it narrows
 * on the keystroke instead of on a debounce, and there is no paused, errored or
 * settling state to draw for a filter over an array.
 *
 * The rows carry their own picture. That is most of the point of this tab —
 * a meal somebody photographed is recognisable from six weeks away in a way its
 * name is not, and the catalogue's side of the panel has a drawing at best.
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
        description={t('logging:search.mineOfflineBody')}
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
        description={t('logging:search.mineNoMatchBody')}
        icon={{ set: 'ui', name: 'search' }}
      />
    ) : (
      <EmptyState
        title={t('logging:search.mineEmptyTitle')}
        description={t('logging:search.mineEmptyBody')}
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
