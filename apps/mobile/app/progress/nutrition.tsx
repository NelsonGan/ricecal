import { subDays } from 'date-fns'
import { useTranslation } from 'react-i18next'

import { dateKey, today, useNutritionRange, useTargets, useTopFoods } from '@/data'
import { ItemRow } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { progressOf } from '@/lib/nutrition'
import { AppBar, Card, MacroBar, Screen } from '@/ui'

const WINDOW_DAYS = 30

/** P6 NUTRITION */
export default function NutritionScreen() {
  const { t } = useTranslation(['progress', 'common'])
  const goBack = useBack('/trends')
  const { data: targets } = useTargets()

  // `daily_nutrition` has already summed each day, so the average is over rows
  // rather than over every entry the phone would otherwise have to fetch.
  const to = today()
  const { data: days = [] } = useNutritionRange(dateKey(subDays(new Date(to), WINDOW_DAYS)), to)
  const { data: top = [] } = useTopFoods(4)

  const n = Math.max(1, days.length)
  const average = (pick: (row: (typeof days)[number]) => number) =>
    Math.round(days.reduce((sum, row) => sum + pick(row), 0) / n)

  const avg = {
    kcal: average((row) => row.kcal ?? 0),
    carbs: average((row) => Number(row.carbs_g ?? 0)),
    protein: average((row) => Number(row.protein_g ?? 0)),
    fat: average((row) => Number(row.fat_g ?? 0)),
  }

  // The catalogue carries fibre and sugar per dish, but most rows are still
  // null — the columns exist so this estimate can be deleted a row at a time
  // rather than rewritten. Where the real numbers add up to nothing, fall back
  // to the proportion of carbohydrate they usually are.
  const measuredFibre = average((row) => Number(row.fibre_g ?? 0))
  const measuredSugar = average((row) => Number(row.sugar_g ?? 0))
  const fibre = measuredFibre || Math.round(avg.carbs * 0.08)
  const sugar = measuredSugar || Math.round(avg.carbs * 0.28)

  return (
    <Screen>
      <AppBar
        title={t('progress:nutrition.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      <Card title={t('progress:nutrition.averageDay')}>
        <MacroBar
          label={t('progress:nutrition.calories')}
          amount={t('progress:nutrition.caloriesValue', { value: avg.kcal.toLocaleString() })}
          value={progressOf(avg.kcal, targets?.kcal ?? 0)}
          tone="pandan"
        />
        <MacroBar
          label={t('common:macro.carbs')}
          amount={t('progress:nutrition.gramsValue', { value: avg.carbs })}
          value={progressOf(avg.carbs, targets?.carbs ?? 0)}
          tone="kaya"
        />
        <MacroBar
          label={t('common:macro.protein')}
          amount={t('progress:nutrition.gramsValue', { value: avg.protein })}
          value={progressOf(avg.protein, targets?.protein ?? 0)}
          tone="hibiscus"
        />
        <MacroBar
          label={t('common:macro.fat')}
          amount={t('progress:nutrition.gramsValue', { value: avg.fat })}
          value={progressOf(avg.fat, targets?.fat ?? 0)}
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
        {top.map(({ food, timesLogged }) => (
          <ItemRow
            key={food.id}
            title={food.name}
            icon={food.icon}
            photoPath={food.imagePath}
            value={food.macros.kcal}
            unit="kcal"
            detail={t('progress:nutrition.timesThisMonth', { count: timesLogged })}
          />
        ))}
      </Card>
    </Screen>
  )
}
