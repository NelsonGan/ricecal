import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Recipe } from '@/data'
import { Icon, type IconProps, Text } from '@/ui'
import { useDurationText } from './useDurationText'

/**
 * Prep, cook and servings, as three tiles under the title: the overview a cook
 * reads before deciding to make it tonight. A time nobody wrote down is left out
 * rather than drawn as a dash, and servings is always there.
 */
export function RecipeStats({
  recipe,
}: {
  recipe: Pick<Recipe, 'prepMinutes' | 'cookMinutes' | 'servings'>
}) {
  const { t } = useTranslation('recipes')
  const duration = useDurationText()

  return (
    <View className="flex-row gap-2">
      {recipe.prepMinutes != null ? (
        <Stat
          icon={{ set: 'food', name: 'knife' }}
          label={t('detail.prep')}
          value={duration(recipe.prepMinutes)}
        />
      ) : null}
      {recipe.cookMinutes != null ? (
        <Stat
          icon={{ set: 'food', name: 'cooking-pot' }}
          label={t('detail.cook')}
          value={duration(recipe.cookMinutes)}
        />
      ) : null}
      <Stat
        icon={{ set: 'system', name: 'users-group' }}
        label={t('edit.servingsRow')}
        value={String(recipe.servings)}
      />
    </View>
  )
}

/**
 * The icon over the words rather than beside them: three across a 375pt phone
 * left about 40pt for "1 h 30 min" beside a 28pt icon, and it cut off.
 */
function Stat({ icon, label, value }: { icon: IconProps; label: string; value: string }) {
  return (
    <View
      className="min-w-0 flex-1 items-center gap-1 rounded-tile border-[3px] border-line bg-surface px-2 py-2.5"
      accessible
      accessibilityLabel={`${label}, ${value}`}
    >
      <Icon {...icon} size={26} />
      <Text variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {value}
      </Text>
      <Text variant="caption" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}
