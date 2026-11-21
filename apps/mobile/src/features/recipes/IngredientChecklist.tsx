import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { RecipeIngredient } from '@/data'
import { cn, Divider, Icon, Tappable, Text } from '@/ui'
import { scaleIngredient } from './cooking'
import { useIngredientMeasure } from './useIngredientMeasure'

export type IngredientChecklistProps = {
  ingredients: RecipeIngredient[]
  /** What the pot was written for. */
  servings: number
  /** What it is being cooked for tonight. The amounts follow this. */
  cooking: number
  ticked: ReadonlySet<string>
  onToggle: (id: string) => void
}

/**
 * Which ingredients are already in the pot, per recipe, for as long as the app
 * is open. In memory and shared, so a tick on the recipe page is still there in
 * cook mode and back again: they are two views of one session at the stove.
 * Never persisted, because a list that remembered yesterday's would open with
 * half of it struck through.
 */
const tickStore = new Map<string, ReadonlySet<string>>()
const listeners = new Set<() => void>()
const NONE: ReadonlySet<string> = new Set()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useTickedIngredients(recipeId: string) {
  const ticked = useSyncExternalStore(subscribe, () => tickStore.get(recipeId) ?? NONE)
  const toggle = (ingredientId: string) => {
    const next = new Set(tickStore.get(recipeId) ?? NONE)
    if (next.has(ingredientId)) next.delete(ingredientId)
    else next.add(ingredientId)
    tickStore.set(recipeId, next)
    for (const listener of listeners) listener()
  }
  return [ticked, toggle] as const
}

/**
 * The shopping and mise en place list: every ingredient at tonight's amounts,
 * each one tickable so the cook knows what is already in the pot.
 *
 * The ticks are not on the recipe: see `useTickedIngredients`.
 */
export function IngredientChecklist({
  ingredients,
  servings,
  cooking,
  ticked,
  onToggle,
}: IngredientChecklistProps) {
  const { t } = useTranslation('recipes')
  const measure = useIngredientMeasure()

  return (
    <View>
      {ingredients.map((item, index) => {
        const done = ticked.has(item.id)
        const amount = measure(scaleIngredient(item, servings, cooking))
        return (
          <View key={item.id}>
            {index > 0 ? <Divider /> : null}
            <Tappable
              className="min-h-[48px] flex-row items-center gap-3 py-2"
              onPress={() => onToggle(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              accessibilityLabel={`${t('detail.tick', { name: item.name })}, ${amount}`}
            >
              <Icon set="ui" name={done ? 'checkbox-checked' : 'checkbox-empty'} size={24} />
              <Text
                variant="bodyStrong"
                className={cn('min-w-0 flex-1', done && 'text-faint line-through')}
                numberOfLines={2}
              >
                {item.name}
              </Text>
              <Text variant="meta" className={cn(done && 'text-faint')}>
                {amount}
              </Text>
            </Tappable>
          </View>
        )
      })}
    </View>
  )
}
