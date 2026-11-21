import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Recipe } from '@/data'
import { energyShare } from '@/lib/nutrition'
import { Text } from '@/ui'
import { useDurationText } from './useDurationText'

/**
 * Prep, cook and servings on one soft strip under the title: the overview a
 * cook reads before deciding to make it tonight. One strip with hairlines
 * rather than three bordered tiles, which with the nutrition card under them
 * made the top of the page a stack of boxes. A time nobody wrote down is left
 * out rather than drawn as a dash.
 */
export function RecipeStats({
  recipe,
}: {
  recipe: Pick<Recipe, 'prepMinutes' | 'cookMinutes' | 'servings'>
}) {
  const { t } = useTranslation('recipes')
  const duration = useDurationText()
  type Item = { key: string; label: string; value: string }
  const items: Item[] = []
  // A zero is a time nobody really gave, and "Prep 0 min" says otherwise.
  if (recipe.prepMinutes) {
    items.push({ key: 'prep', label: t('detail.prep'), value: duration(recipe.prepMinutes) })
  }
  if (recipe.cookMinutes) {
    items.push({ key: 'cook', label: t('detail.cook'), value: duration(recipe.cookMinutes) })
  }
  items.push({ key: 'serves', label: '', value: t('servings', { count: recipe.servings }) })

  return (
    <View className="flex-row items-center rounded-tile bg-track px-2 py-3">
      {items.map((item, index) => (
        <View
          key={item.key}
          className={
            index > 0 ? 'min-w-0 flex-1 border-l-2 border-line px-1' : 'min-w-0 flex-1 px-1'
          }
          accessible
          accessibilityLabel={[item.label, item.value].filter(Boolean).join(', ')}
        >
          <Text
            variant="meta"
            className="text-center"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {item.label ? `${item.label} ` : ''}
            <Text variant="label">{item.value}</Text>
          </Text>
        </View>
      ))}
    </View>
  )
}

/**
 * What a serving costs, said once: the calories large, the three macros as one
 * bar split by the energy each contributes, and their grams on a line under it.
 * It replaced a card of three separate bars beside the figure, which read as
 * three things to compare when the question is one number.
 */
export function RecipeNutrition({ perServing }: { perServing: Recipe['perServing'] }) {
  const { t } = useTranslation(['recipes', 'common'])
  const share = energyShare(perServing)
  const grams = (value: number) => t('common:unit.grams', { value })
  const legend = [
    `${t('common:macro.carbs')} ${grams(perServing.carbs)}`,
    `${t('common:macro.protein')} ${grams(perServing.protein)}`,
    `${t('common:macro.fat')} ${grams(perServing.fat)}`,
  ].join(' · ')

  return (
    <View
      className="gap-2"
      accessible
      accessibilityLabel={`${perServing.kcal.toLocaleString()} ${t('common:unit.kcal')} ${t('recipes:detail.perServing')}. ${legend}`}
    >
      <View className="flex-row items-baseline gap-1.5">
        <Text variant="displayMd" className="text-pandan-ink">
          {perServing.kcal.toLocaleString()}
        </Text>
        <Text variant="label" className="text-pandan-ink">
          {t('common:unit.kcal')}
        </Text>
        <Text variant="meta">{t('recipes:detail.perServing')}</Text>
      </View>
      <View className="h-2.5 flex-row overflow-hidden rounded-full bg-track">
        <View className="bg-kaya" style={{ flex: share.carbs }} />
        <View className="bg-hibiscus" style={{ flex: share.protein }} />
        <View className="bg-teh" style={{ flex: share.fat }} />
      </View>
      <Text variant="meta" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {legend}
      </Text>
    </View>
  )
}
