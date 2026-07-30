import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useFoodSearch } from '@/data'
import { ItemRow } from '@/features/shared'
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

  // The database does the ranking, not just the filtering: `search_foods`
  // fuses an exact, a full-text and a trigram match. Searching a table the
  // phone does not hold is the whole point of having moved the catalogue off
  // it — there are ~460,000 rows in it now.
  const { data: results = [], isPending } = useFoodSearch(debouncedQuery)

  // Before the first keystroke there is nothing to say. The empty state reads
  // "No dish by that name", which is only true once a name has been typed.
  const searched = debouncedQuery.trim().length > 0

  // Typing again should not leave the previous dishes on screen looking like
  // answers to the new query. `isPending` alone misses this: the debounced
  // query has not changed yet, so the old result set is still "fresh".
  const settling = query.trim() !== debouncedQuery.trim()
  const loading = query.trim().length > 0 && (settling || (searched && isPending))

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

      {loading ? (
        <View className="gap-3" accessibilityRole="progressbar">
          {SKELETON_ROWS.map((id) => (
            // Shaped like the row it replaces — two lines of text and a
            // trailing number, no tile — so the list does not jump when the
            // results land.
            <Card key={id}>
              <View className="flex-row items-center gap-3">
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

      {!loading && searched && results.length === 0 ? (
        <EmptyState
          title={t('logging:search.emptyTitle')}
          description={t('logging:search.emptyBody')}
          icon={{ set: 'ui', name: 'search' }}
        />
      ) : null}

      {!loading &&
        results.map((food) => (
          <Card key={food.id}>
            <ItemRow
              title={food.name}
              // Text only. The catalogue is hundreds of megabytes of imported
              // rows and a few dozen drawings, so a picture here is the exception
              // by a wide margin — and a column of mostly-empty tiles indents
              // every dish name for the sake of the rare one that has art.
              textOnly
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
