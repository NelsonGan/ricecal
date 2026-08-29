import { View } from 'react-native'

import { radius, slab } from '@/theme/tokens'
import { cn, Icon, type IconProps, ProgressBar, type ProgressTone, Squish, Text } from '@/ui'

export type RingStat = {
  key: string
  label: string
  /** The figure, already formatted. */
  value: string
  /** "/ 400 kcal", or just the bare unit when the store gave no goal. */
  unit: string
  /** 0–1 against the goal, or null when there is no goal to be against. */
  progress: number | null
  tone: ProgressTone
  icon: IconProps
}

export type RingTrioProps = {
  stats: readonly RingStat[]
  className?: string
}

/**
 * The three figures at the top of the Activity tab.
 *
 * Bars rather than the design's concentric rings. Three nested arcs are legible
 * at 180pt on a watch face and illegible at the 100pt a side-by-side tile gets on
 * a phone, and they would be borrowing Apple's visual language for a row that has
 * to render on Android, where the third value is not Stand at all.
 *
 * So each figure gets a tile carrying its own bar, which survives the third stat
 * changing between platforms and matches the metric tiles on Trends.
 *
 * The third tile is a prop rather than a conditional, so this component never
 * learns which platform it is on; the screen that does know says so in a
 * footnote.
 */
export function RingTrio({ stats, className }: RingTrioProps) {
  return (
    <View className={cn('flex-row gap-2.5', className)}>
      {stats.map((stat) => (
        <Squish
          key={stat.key}
          depth={slab.md}
          radius={radius.tile}
          containerClassName="min-w-0 flex-1"
          slabClassName="bg-line"
          // `grow` for the reason `StatTile` gives: the slab stretches to the
          // tallest sibling, and a shorter tile shows a bare strip underneath.
          className="grow gap-2 px-3 py-3.5 bg-surface"
          accessibilityLabel={`${stat.label}: ${stat.value} ${stat.unit}`}
        >
          <View className="flex-row items-center gap-1.5">
            <Icon {...stat.icon} size={18} />
            <Text variant="overlineSm" numberOfLines={1} className="flex-1">
              {stat.label}
            </Text>
          </View>

          {/* Value and unit share a baseline row rather than stacking: "360"
              above "/ 400 kcal" reads as two numbers, and the whole point of
              the tile is that it is one measurement against one target. */}
          <View className="flex-row items-baseline gap-1">
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              // No `leading-` — see the note in `StatTile`: an explicit line
              // height alongside `adjustsFontSizeToFit` shrinks text that had
              // room, worst at the fractional widths a row of three produces.
              className="font-display text-[24px] text-heading"
            >
              {stat.value}
            </Text>
            <Text variant="micro" numberOfLines={1} className="flex-1">
              {stat.unit}
            </Text>
          </View>

          {/* A track with no fill where there is no goal. The bar still draws,
              because three tiles of which one has no bar is a layout that looks
              broken rather than a tile that is missing a target. */}
          <ProgressBar
            value={stat.progress ?? 0}
            tone={stat.tone}
            height={6}
            animateOnMount={false}
          />
        </Squish>
      ))}
    </View>
  )
}
