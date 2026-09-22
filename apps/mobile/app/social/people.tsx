import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useSocialSearch, useSocialSuggestions } from '@/data/social'
import { PersonRow, SocialBar, SocialList } from '@/features/social/components'
import { useDebouncedValue } from '@/lib/use-debounce'
import { Screen, SearchField, Text } from '@/ui'

export default function PeopleScreen() {
  const { t } = useTranslation('social')
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query.trim().toLowerCase().replace(/^@/, ''))
  const search = useSocialSearch(debounced)
  const suggestions = useSocialSuggestions()
  const suggested = {
    ...suggestions,
    data: suggestions.data ? { pages: [{ rows: suggestions.data, next: null }] } : undefined,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: async () => undefined,
  }
  return (
    <Screen
      scroll={false}
      flush
      header={
        <View className="gap-2 pb-2">
          <SocialBar title={t('people')} />
          <SearchField
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery('')}
            clearLabel={t('cancel')}
            placeholder={t('search')}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      }
    >
      {query.trim() ? (
        <SocialList
          key={debounced}
          query={search}
          rowKey={(person) => person.user_id}
          renderRow={(person, visible) => <PersonRow person={person} visible={visible} />}
          empty={t('emptyPeople')}
          variant="rows"
        />
      ) : (
        <SocialList
          query={suggested}
          rowKey={(person) => person.user_id}
          renderRow={(person, visible) => <PersonRow person={person} visible={visible} />}
          empty={t('emptyPeople')}
          header={<Text variant="label">{t('suggestions')}</Text>}
          variant="rows"
        />
      )}
    </Screen>
  )
}
