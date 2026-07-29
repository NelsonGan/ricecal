import { useLocalSearchParams, useRouter } from 'expo-router'
import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import { type Meal, type SearchFilter, useFoodSearch } from '@/data'
import { ItemRow } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import {
  AppBar,
  Badge,
  Card,
  Chip,
  EmptyState,
  Icon,
  Screen,
  SearchField,
  Skeleton,
  Text,
} from '@/ui'

/**
 * The chips, in order. `mine` is not a place — it is the owner filter,
 * `owner_id = me`. Narrower than `SearchFilter`, which also admits the two
 * places the design does not offer a chip for.
 */
const FILTERS = ['all', 'mine', 'mamak', 'kopitiam', 'packaged'] as const

/** L5 SEARCH */
export default function SearchScreen() {
  const { t } = useTranslation(['logging', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const params = useLocalSearchParams<{ meal?: Meal }>()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SearchFilter>('all')

  // The field renders `query` on every keystroke; the list filters on a
  // deferred copy. Filtering inline makes the input wait for the list to
  // re-render, which on a fast typist drops and reorders characters.
  const deferredQuery = useDeferredValue(query)

  const meal = params.meal

  // The database does the filtering: `ilike` on the name, the place, or the
  // owner. Searching a table the phone does not hold is the whole point of
  // having moved the catalogue off it.
  const { data: results = [], isPending } = useFoodSearch(deferredQuery, filter)

  const openCustom = () =>
    router.push({
      // Whatever was typed and not found is the name of the dish about to be
      // created — retyping it would be the app forgetting on purpose.
      pathname: '/log/custom',
      params: { meal, name: query.trim() },
    })

  return (
    <Screen>
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

      <View className="flex-row flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Chip key={option} selected={filter === option} onPress={() => setFilter(option)}>
            {t(`logging:search.filters.${option}`)}
          </Chip>
        ))}
      </View>

      {isPending ? <Skeleton className="h-[76px] w-full" /> : null}

      {!isPending && results.length === 0 ? (
        <EmptyState
          title={t('logging:search.emptyTitle')}
          description={t('logging:search.emptyBody')}
          icon={{ set: 'ui', name: 'search' }}
        />
      ) : null}

      {results.map((food, index) => (
        <Card key={food.id}>
          <ItemRow
            title={food.name}
            icon={food.icon}
            photoPath={food.imagePath}
            value={food.macros.kcal}
            unit="kcal"
            detail={`${t(`logging:search.place.${food.place}`)} · ${food.servingLabel}`}
            // A dish of the user's own says so; otherwise the top hit carries a
            // confidence badge, the way a ranked result set does.
            trailing={
              food.custom ? (
                <Badge tone="water">
                  <Text variant="micro" className="text-water-ink">
                    {t('logging:search.yours')}
                  </Text>
                </Badge>
              ) : index === 0 && deferredQuery.length > 0 ? (
                <Badge tone="pandan">
                  <Text variant="micro" className="text-pandan-ink">
                    {t('logging:search.match', { percent: 96 })}
                  </Text>
                </Badge>
              ) : undefined
            }
            onPress={() =>
              router.push({ pathname: '/log/food/[id]', params: { id: food.id, meal } })
            }
          />
        </Card>
      ))}

      <Pressable
        onPress={openCustom}
        className="mb-2 flex-row items-center justify-center gap-2 rounded-tile border-[3px] border-line border-dashed p-3"
        accessibilityRole="button"
        accessibilityLabel={t('logging:search.customFood')}
      >
        <Icon set="ui" name="plus" size={20} />
        <Text variant="label" className="text-muted">
          {t('logging:search.customFood')}
        </Text>
      </Pressable>
    </Screen>
  )
}
