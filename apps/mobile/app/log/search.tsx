import { useLocalSearchParams, useRouter } from 'expo-router'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { FoodRow } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { FOODS, type Meal, type Place } from '@/mock'
import { AppBar, Badge, Card, Chip, EmptyState, Screen, SearchField, Text } from '@/ui'

type Filter = 'all' | Extract<Place, 'mamak' | 'kopitiam' | 'packaged'>
const FILTERS: Filter[] = ['all', 'mamak', 'kopitiam', 'packaged']

/** L5 SEARCH */
export default function SearchScreen() {
  const { t } = useTranslation(['logging', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const params = useLocalSearchParams<{ meal?: Meal }>()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  // The field renders `query` on every keystroke; the list filters on a
  // deferred copy. Filtering inline makes the input wait for the list to
  // re-render, which on a fast typist drops and reorders characters.
  const deferredQuery = useDeferredValue(query)

  const meal = params.meal

  const results = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    return FOODS.filter((food) => filter === 'all' || food.place === filter).filter(
      (food) => !needle || food.name.toLowerCase().includes(needle),
    )
  }, [deferredQuery, filter])

  return (
    <Screen>
      <AppBar title={t('logging:search.title')} onBack={() => goBack()} />

      <SearchField
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery('')}
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

      {results.length === 0 ? (
        <EmptyState
          title={t('logging:search.emptyTitle')}
          description={t('logging:search.emptyBody')}
          icon={{ set: 'ui', name: 'search' }}
        />
      ) : null}

      {results.map((food, index) => (
        <Card key={food.id}>
          <FoodRow
            name={food.name}
            icon={food.icon}
            kcal={food.macros.kcal}
            detail={`${t(`logging:search.place.${food.place}`)} · ${food.servingLabel}`}
            // The top hit carries a confidence badge, the way a ranked result
            // set does. Everything below it is just a match.
            trailing={
              index === 0 && deferredQuery.length > 0 ? (
                <Badge tone="pandan">
                  <Text className="font-body-black text-[11px] leading-[13px] text-pandan-ink">
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

      <Text variant="caption" className="pb-2 text-center">
        {t('logging:search.customFood')}
      </Text>
    </Screen>
  )
}
