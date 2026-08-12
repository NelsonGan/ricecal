import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useFoodSearch } from '@/data'
import { ItemRow, ROW_TILE } from '@/features/shared'
import { useDebouncedValue } from '@/lib/use-debounce'
import { Card, EmptyState, SearchField, Skeleton } from '@/ui'

/**
 * Placeholder rows shown while a search is in flight.
 *
 * Fixed identities rather than `Array.from(...)` with an index key: these never
 * reorder, and a stable key is what stops React reusing a skeleton row as a
 * result row when the data lands.
 */
const SKELETON_ROWS = ['s1', 's2', 's3', 's4', 's5', 's6'] as const

export type FoodSearchPanelProps = {
  /** A dish was chosen. The host decides where that goes. */
  onPick: (foodId: string) => void
  autoFocus?: boolean
}

/**
 * The catalogue search: a field, and what it finds.
 *
 * Extracted from the search route because search is inline in the quick selector
 * now, and the route is still reached from a snap that could not be read ("fix it
 * by typing"). Two hosts, and none of the interesting behaviour — the debounce,
 * what counts as loading, the two empty states — is worth having twice.
 */
export function FoodSearchPanel({ onPick, autoFocus = false }: FoodSearchPanelProps) {
  const { t } = useTranslation(['logging', 'common'])
  const [query, setQuery] = useState('')

  // The field renders `query` on every keystroke; the catalogue is only asked
  // once typing pauses. See `useDebouncedValue` for why this is a debounce
  // rather than the `useDeferredValue` that was here before.
  const debouncedQuery = useDebouncedValue(query)

  // The Worker does the ranking, not just the filtering: it fuses an exact
  // name, an exact alias, a full-text and a trigram match over ~48,000
  // searchable rows. Ranking is the whole reason this is a round trip and not
  // a filter over something the phone holds.
  const { data, isFetching, isPaused, isError } = useFoodSearch(debouncedQuery)
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
   * The skeletons are gated on `isFetching`, not on the `isPending` that was here
   * before. `isPending` means "this key has no data", which is also true of a
   * query that is not fetching at all — one paused by `networkMode: 'offlineFirst'`
   * with no connection, which is how a search with no results showed skeletons
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

  return (
    <View className="gap-3">
      <SearchField
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery('')}
        clearLabel={t('logging:search.clear')}
        placeholder={t('logging:search.placeholder')}
        autoFocus={autoFocus}
        returnKeyType="search"
      />

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
        results.map((food) => (
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
              unit="kcal"
              detail={`${t(`logging:search.place.${food.place}`)} · ${food.servingLabel}`}
              onPress={() => onPick(food.id)}
            />
          </Card>
        ))}
    </View>
  )
}
