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
 * WHY BARS RATHER THAN RINGS
 *
 * The design draws Apple's three concentric rings, and this does not. Three
 * nested arcs are legible at 180pt in the middle of a watch face and illegible
 * at the 100pt each of three side-by-side tiles gets on a 393pt phone — the
 * innermost ring ends up four points across. More to the point, the rings would
 * be borrowing Apple's visual language for a row that has to render on Android
 * too, where the third value is not Stand at all.
 *
 * So each figure gets a tile, and the tile carries its own bar. It is the same
 * information, it survives the third stat changing between platforms, and it
 * matches the metric tiles on Trends — which is the row directly one tab over.
 *
 * WHY THE THIRD TILE IS A PROP AND NOT A CONDITIONAL
 *
 * Apple reports stand hours and Health Connect has no such record type. The
 * caller decides what the third tile is, so this component never learns which
 * platform it is on, and the screen that DOES know says so in a footnote
 * naming the app responsible.
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
