import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { type Meal, snapshotFromEntry, useLogFood, useSelectedDate } from '@/data'
import { FoodSearchPanel } from '@/features/logging'
import { useBack } from '@/lib/navigation'
import { AppBar, Screen } from '@/ui'

/**
 * L5 SEARCH, as a page of its own.
 *
 * Reached from a snap the recogniser could not read — "tap to pick the dish
 * yourself" — which is the one route into search that does not come through the
 * quick selector, where search is now a panel inside the sheet.
 *
 * Which is also why the second tab earns its place here more than anywhere: the
 * plate this screen is standing in for is one the app failed to read, and the
 * likeliest true answer is something the person has eaten before.
 */
export default function SearchScreen() {
  const { t } = useTranslation(['logging', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const params = useLocalSearchParams<{ meal?: Meal }>()
  const { selectedDate } = useSelectedDate()
  const logFood = useLogFood()

  return (
    <Screen>
      {/* A chevron, not a cross: this is a full page, and the row it was opened
          from is still on the day behind it. */}
      <AppBar
        title={t('logging:search.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      <FoodSearchPanel
        autoFocus
        onPick={(food) =>
          router.push({ pathname: '/log/food/[id]', params: { id: food.id, meal: params.meal } })
        }
        // A dish out of the history is WRITTEN HERE and this screen leaves,
        // where a catalogue dish goes on to a page that asks for a portion
        // first. The asymmetry is the point: the catalogue knows a food and not
        // how much of it, while an entry is a meal somebody already ate at a
        // size they already accepted, so asking again is asking a question that
        // has an answer. It is editable on the row afterwards like any other.
        onPickHistory={(entry) => {
          logFood.mutate({
            snapshot: snapshotFromEntry(entry),
            quantity: entry.quantity,
            logDate: selectedDate,
            source: 'quickAdd',
            method: 'history',
          })
          goBack()
        }}
      />
    </Screen>
  )
}
