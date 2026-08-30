import { View } from 'react-native'

import { Text } from '@/ui'

export type TrendStat = {
  key: string
  /** Caps label above the value: "GOAL DAYS", "MONTHS LOGGED". */
  label: string
  value: string
}

export type StatTrioProps = {
  stats: readonly TrendStat[]
}

/**
 * The three-figure row that sits under each chart. Two details are load-bearing,
 * and both were bugs first.
 *
 * The label gets two lines' worth of room whether or not it needs it: three
 * columns inside a card leave about 95pt each, and "MONTHS LOGGED" does not fit
 * one line. Reserving the height keeps the three values on one baseline when only
 * one label wraps.
 *
 * The value carries no `leading-`. `adjustsFontSizeToFit` beside an explicit
 * lineHeight is a long-standing React Native bug that shrinks text with plenty of
 * room, worst on the fractional heights `flex-1` produces; the symptom was
 * "6.1 cups" rendering at about four points.
 */
export function StatTrio({ stats }: StatTrioProps) {
  return (
    <View className="flex-row gap-md">
      {stats.map((stat) => (
        <View key={stat.key} className="min-w-0 flex-1 gap-0.5">
          <View className="min-h-[30px]">
            <Text variant="overlineSm" numberOfLines={2}>
              {stat.label}
            </Text>
          </View>
          <Text
            className="font-display text-[18px] text-ink"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {stat.value}
          </Text>
        </View>
      ))}
    </View>
  )
}
