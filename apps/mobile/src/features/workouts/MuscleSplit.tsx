import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Text } from '@/ui'
import type { MuscleGroup } from './catalogue'
import { MUSCLE_GROUP_KEY } from './copy'

/**
 * Where the work went, as one bar per body part: the muscle split of a
 * workout or a month.
 *
 * Bars rather than a body diagram. A diagram reads beautifully when one part
 * is lit and becomes a heat map nobody can quantify the moment four are; a bar
 * says "chest 9 sets, back 6" in a glance at any count.
 */

const GROUP_TONE: Record<MuscleGroup, string> = {
  chest: 'bg-hibiscus',
  back: 'bg-water',
  shoulders: 'bg-kaya',
  arms: 'bg-teh',
  legs: 'bg-pandan',
  core: 'bg-inverse-accent',
}

/**
 * Each bar says its share of the whole. A split counted in sets came out in
 * tenths ("1.8 sets"), since a set of a compound lift counts towards several
 * groups, and that reads as a bug rather than as a split.
 */
export function MuscleSplitBars({
  rows,
}: {
  rows: readonly { group: MuscleGroup; sets: number }[]
}) {
  const { t } = useTranslation(['workouts'])
  const max = Math.max(...rows.map((row) => row.sets), 0)
  const total = rows.reduce((sum, row) => sum + row.sets, 0)
  const share = (value: number) => `${total > 0 ? Math.round((value / total) * 100) : 0}%`

  return (
    <View className="gap-2.5">
      {rows.map((row) => (
        <View key={row.group} className="flex-row items-center gap-3">
          <Text variant="label" className="w-[86px]" numberOfLines={1}>
            {t(MUSCLE_GROUP_KEY[row.group])}
          </Text>
          <View className="h-[12px] flex-1 overflow-hidden rounded-full bg-track">
            <View
              className={`h-full rounded-full ${GROUP_TONE[row.group]}`}
              style={{ width: `${max > 0 ? Math.max(4, (row.sets / max) * 100) : 0}%` }}
            />
          </View>
          <Text variant="meta" className="w-[64px] text-right" numberOfLines={1}>
            {share(row.sets)}
          </Text>
        </View>
      ))}
    </View>
  )
}
