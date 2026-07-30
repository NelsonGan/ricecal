import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Meal, useFoodSearch } from '@/data'
import { ItemRow } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { useDebouncedValue } from '@/lib/use-debounce'
import { AppBar, Card, EmptyState, Screen, SearchField, Skeleton } from '@/ui'

/**
 * Placeholder rows shown while a search is in flight.
 *
 * Fixed identities rather than `Array.from(...)` with an index key: these never
 * reorder, and a stable key is what stops React reusing a skeleton row as a
 * result row when the data lands.
 */
const SKELETON_ROWS = ['s1', 's2', 's3', 's4', 's5', 's6'] as const

/** L5 SEARCH */
export default function SearchScreen() {
  const { t } = useTranslation(['logging', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const params = useLocalSearchParams<{ meal?: Meal }>()
  const [query, setQuery] = useState('')

  // The field renders `query` on every keystroke; the catalogue is only asked
  // once typing pauses. See `useDebouncedValue` for why this is a debounce
  // rather than the `useDeferredValue` that was here before.
  const debouncedQuery = useDebouncedValue(query)

  const meal = params.meal

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
    <Screen>
      {/* A chevron, not a cross: this is a full page that pushes, so there is a
          screen behind it to go back to — the quick selector it was opened
          from. */}
      <AppBar
        title={t('logging:search.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      <SearchField
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery('')}
        clearLabel={t('logging:search.clear')}
        placeholder={t('logging:search.placeholder')}
        autoFocus
        returnKeyType="search"
      />

      {loading ? (
        <View className="gap-3" accessibilityRole="progressbar">
          {SKELETON_ROWS.map((id) => (
            // Shaped like the row it replaces — icon, two lines of text, a
            // trailing number — so the list does not jump when results land.
            <Card key={id}>
              <View className="flex-row items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-tile" />
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
              icon={food.icon}
              value={food.macros.kcal}
              unit="kcal"
              detail={`${t(`logging:search.place.${food.place}`)} · ${food.servingLabel}`}
              onPress={() =>
                router.push({ pathname: '/log/food/[id]', params: { id: food.id, meal } })
              }
            />
          </Card>
        ))}
    </Screen>
  )
}
