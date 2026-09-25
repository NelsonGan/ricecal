import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useSocialSearch, useSocialSuggestions } from '@/data/social'
import { PersonRow, SocialBar, SocialList } from '@/features/social/components'
import { useDebouncedValue } from '@/lib/use-debounce'
import { EmptyState, Screen, SearchField, Text } from '@/ui'

export default function PeopleScreen() {
  const { t } = useTranslation(['social', 'recipes'])
  const [query, setQuery] = useState('')
  // Match the dots generated from spaces in names before searching handles.
  const handleCharacters = query
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9_.]/g, '')
  // A name in another script can leave only the dot created from its space.
  const handle = /[a-z0-9_]/.test(handleCharacters) ? handleCharacters : ''
  // Do not silently search a truncated prefix while the field shows something
  // longer. A handle cannot exceed 24 characters, so that visible query has no
  // possible match.
  const searchableHandle = handle.length <= 24 ? handle : ''
  const debounced = useDebouncedValue(searchableHandle)
  const search = useSocialSearch(debounced)
  const suggestions = useSocialSuggestions()
  const suggested = {
    ...suggestions,
    data: suggestions.data ? { pages: [{ rows: suggestions.data, next: null }] } : undefined,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
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
            clearLabel={t('recipes:search.clear')}
            placeholder={t('search')}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      }
    >
      {query.trim() && !searchableHandle ? (
        <View className="px-5">
          <EmptyState title={t('emptyPeople')} />
        </View>
      ) : query.trim() ? (
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
