import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import type { Meal } from '@/data'
import { FoodSearchPanel } from '@/features/logging'
import { useBack } from '@/lib/navigation'
import { AppBar, Screen } from '@/ui'

/**
 * L5 SEARCH, as a page of its own.
 *
 * Reached from a snap the recogniser could not read — "tap to pick the dish
 * yourself" — which is the one route into search that does not come through the
 * quick selector, where search is now a panel inside the sheet.
 */
export default function SearchScreen() {
  const { t } = useTranslation(['logging', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const params = useLocalSearchParams<{ meal?: Meal }>()

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
        onPick={(id) =>
          router.push({ pathname: '/log/food/[id]', params: { id, meal: params.meal } })
        }
      />
    </Screen>
  )
}
