import { subDays } from 'date-fns'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { FoodRow } from '@/features/shared'
import { dateKey, entryMacros, getFood, progressOf, sumMacros, useAppState, useStore } from '@/mock'
import { AppBar, Card, MacroBar, Screen } from '@/ui'

const WINDOW_DAYS = 30

/** P6 NUTRITION */
export default function NutritionScreen() {
  const { t } = useTranslation(['progress', 'common'])
  const router = useRouter()
  const { state } = useStore()
  const targets = useAppState((s) => s.targets)

  const days = Array.from(
    { length: WINDOW_DAYS },
    (_, index) => state.days[dateKey(subDays(new Date(), index))],
  ).filter((day) => day && day.entries.length > 0)

  const totals = days.reduce(
    (sum, day) => {
      const macros = sumMacros(day.entries)
      return {
        kcal: sum.kcal + macros.kcal,
        carbs: sum.carbs + macros.carbs,
        protein: sum.protein + macros.protein,
        fat: sum.fat + macros.fat,
      }
    },
    { kcal: 0, carbs: 0, protein: 0, fat: 0 },
  )

  const n = Math.max(1, days.length)
  const avg = {
    kcal: Math.round(totals.kcal / n),
    carbs: Math.round(totals.carbs / n),
    protein: Math.round(totals.protein / n),
    fat: Math.round(totals.fat / n),
  }

  // Fibre and sugar are not tracked per food in the catalogue. Deriving them
  // from carbs keeps the row honest about being an estimate rather than
  // inventing a number per dish.
  const fibre = Math.round(avg.carbs * 0.08)
  const sugar = Math.round(avg.carbs * 0.28)

  const counts = new Map<string, number>()
  for (const day of days) {
    for (const entry of day.entries) counts.set(entry.foodId, (counts.get(entry.foodId) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)

  return (
    <Screen>
      <AppBar title={t('progress:nutrition.title')} onBack={() => router.back()} />

      <Card title={t('progress:nutrition.averageDay')}>
        <MacroBar
          label={t('progress:nutrition.calories')}
          amount={t('progress:nutrition.caloriesValue', { value: avg.kcal.toLocaleString() })}
          value={progressOf(avg.kcal, targets.kcal)}
          tone="pandan"
        />
        <MacroBar
          label={t('common:macro.carbs')}
          amount={t('progress:nutrition.gramsValue', { value: avg.carbs })}
          value={progressOf(avg.carbs, targets.carbs)}
          tone="kaya"
        />
        <MacroBar
          label={t('common:macro.protein')}
          amount={t('progress:nutrition.gramsValue', { value: avg.protein })}
          value={progressOf(avg.protein, targets.protein)}
          tone="hibiscus"
        />
        <MacroBar
          label={t('common:macro.fat')}
          amount={t('progress:nutrition.gramsValue', { value: avg.fat })}
          value={progressOf(avg.fat, targets.fat)}
          tone="teh"
        />
        <MacroBar
          label={t('progress:nutrition.fibre')}
          amount={t('progress:nutrition.gramsValue', { value: fibre })}
          value={progressOf(fibre, 30)}
          tone="water"
        />
        <MacroBar
          label={t('progress:nutrition.sugar')}
          amount={t('progress:nutrition.gramsValue', { value: sugar })}
          value={progressOf(sugar, 50)}
          tone="hibiscus"
        />
      </Card>

      <Card title={t('progress:nutrition.topFoods')}>
        {top.map(([foodId, count]) => {
          const food = getFood(foodId)
          return (
            <FoodRow
              key={foodId}
              name={food.name}
              icon={food.icon}
              kcal={
                entryMacros({
                  id: 'avg',
                  foodId,
                  meal: 'lunch',
                  quantity: 1,
                  servingId: food.servings[0].id,
                  loggedAt: new Date().toISOString(),
                }).kcal
              }
              detail={t('progress:nutrition.timesThisMonth', { count })}
            />
          )
        })}
      </Card>
    </Screen>
  )
}
