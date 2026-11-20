import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { pluralCount, useMeasureText } from '@/features/shared/useMeasureText'
import { MEASURES } from '@/lib/measures'
import { SegmentedControl, Text } from '@/ui'
import type { IngredientKey } from './basis'

/** A unit's name on a chip or a pill: "g", "tbsp", "pieces". */
export function useUnitName() {
  const { t } = useTranslation('recipes')
  const measure = useMeasureText()
  return (key: IngredientKey, count: number) =>
    key === 'piece'
      ? t('ingredient.unit.piece', { count: pluralCount(count) })
      : measure.unit(key, count)
}

type Group = 'weight' | 'volume' | 'count'

const groupOf = (key: IngredientKey): Group => (key === 'piece' ? 'count' : MEASURES[key].family)

/**
 * The units a picker offers, in rows by what they measure: weight, volume,
 * count.
 *
 * It replaced one row of eight wrapping chips, where "g" sat beside "cups" and
 * "pieces" and nothing said that two of them need the food's density to cross
 * between. In rows, the families are the structure, and a family with nothing
 * to offer for this food is simply absent.
 */
export function UnitGroups({
  keys,
  value,
  onChange,
}: {
  keys: readonly IngredientKey[]
  value: IngredientKey
  onChange: (key: IngredientKey) => void
}) {
  const { t } = useTranslation('recipes')
  const unitName = useUnitName()
  const groups = (['weight', 'volume', 'count'] as const)
    .map((group) => ({ group, keys: keys.filter((key) => groupOf(key) === group) }))
    .filter((entry) => entry.keys.length > 0)

  // One segmented control per family, the same control the food page measures
  // with. A row of loose chips wrapped "tbsp" and "cups" onto a second line of
  // a five-unit family, and read as eight unrelated buttons.
  return (
    <View className="gap-3 rounded-md border-[3px] border-line bg-surface p-3">
      {groups.map(({ group, keys: inGroup }) => (
        <View key={group} className="gap-1.5">
          {/* Only when there is more than one family to tell apart: a lone
              row of spoons needs no heading saying they are volumes. */}
          {groups.length > 1 ? (
            <Text variant="label" className="px-1 text-muted">
              {t(`ingredient.unitGroup.${group}`)}
            </Text>
          ) : null}
          <SegmentedControl
            accessibilityLabel={t(`ingredient.unitGroup.${group}`)}
            value={inGroup.includes(value) ? value : undefined}
            onChange={onChange}
            options={inGroup.map((key) => ({ value: key, label: unitName(key, 1) }))}
          />
        </View>
      ))}
    </View>
  )
}
