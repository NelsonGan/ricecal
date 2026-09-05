import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import {
  type Meal,
  snapshotFromEntry,
  snapshotFromRecipe,
  useLogFood,
  useRecipeQuota,
  useSelectedDate,
} from '@/data'
import { FoodSearchPanel, type FoodSearchSource } from '@/features/logging'
import { useRequirePro } from '@/features/paywall'
import { useBack } from '@/lib/navigation'
import { AppBar, Screen } from '@/ui'

/**
 * The tab a handover asks for, if it named one this page has.
 *
 * A route param is a string from anywhere, and `initialSource` is checked again
 * inside the panel against the tabs this host actually offers. This is the
 * narrowing that lets it be typed at all.
 */
const asSource = (value: string | undefined): FoodSearchSource | undefined =>
  value === 'catalogue' || value === 'mine' || value === 'past' ? value : undefined

/**
 * L5 SEARCH, as a page of its own.
 *
 * Three routes in. A snap the recogniser could not read sends the user here to
 * pick the dish themselves, with an empty field. The quick selector hands off to
 * it with `?q=`, putting this page under the dish somebody picked out of the
 * sheet's inline search, so backing out of that dish lands on the results rather
 * than on the day. And `?source=mine` is the same handover for the "New food"
 * row, which opens a form rather than a dish and is backed out of just as often.
 * See `openPicked` and `openCreate` in `log/index.tsx`.
 *
 * Which is also why the second tab earns its place here more than anywhere: the
 * plate this screen is standing in for is one the app failed to read, and the
 * likeliest true answer is something the person has eaten before.
 */
export default function SearchScreen() {
  const { t } = useTranslation(['logging', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const params = useLocalSearchParams<{
    meal?: Meal
    q?: string
    tracked?: string
    source?: string
  }>()
  const initialSource = asSource(params.source)
  const { selectedDate } = useSelectedDate()
  const logFood = useLogFood()
  const requirePro = useRequirePro()
  // For the "New food" button at the head of the My foods tab. The database
  // enforces the same ceiling; this is the half that opens the paywall instead.
  const recipeQuota = useRecipeQuota()

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
        // Only when this page was opened in its own right. A handover mounts it
        // UNDER the screen it handed off to, where a focus raises the keyboard
        // over that screen, and it means the typing is finished: what the user
        // comes back to is a list to read. `source` is the half of that with no
        // query behind it, since "New food" is reached from an empty field as
        // often as from a search that found nothing.
        autoFocus={!params.q && !initialSource}
        initialSource={initialSource}
        restore={params.q ? { query: params.q, tracked: params.tracked === '1' } : undefined}
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
        /* One serving of the user's own food, written here for the same reason
           the history is: they entered the figures and they said how many the
           pot feeds, so there is nothing left to ask. Any other number of
           servings is a question the food's own screen asks. */
        onPickOwn={(recipe) => {
          logFood.mutate({
            snapshot: snapshotFromRecipe(recipe),
            logDate: selectedDate,
            source: 'quickAdd',
            method: 'recipe',
          })
          goBack()
        }}
        onOpenOwn={(recipe) => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
        onCreateOwn={() => {
          if (recipeQuota.atLimit && !requirePro('new_recipe')) return
          router.push('/recipe/edit')
        }}
      />
    </Screen>
  )
}
