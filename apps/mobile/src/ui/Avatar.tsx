import { Image } from 'expo-image'
import { View } from 'react-native'

import { radius as radiusScale, slab } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { Icon } from './Icon'
import { Squish } from './Squish'
import { Text } from './Text'

const sizes = {
  sm: { box: 40, radius: 14, font: 'text-[15px] leading-[18px]' },
  md: { box: 52, radius: 18, font: 'text-[20px] leading-[24px]' },
  lg: { box: 64, radius: radiusScale.sheet, font: 'text-[26px] leading-[30px]' },
} as const

const tones = ['pandan', 'kaya', 'water', 'hibiscus'] as const
const fills = {
  pandan: { fill: 'bg-pandan', slab: 'bg-pandan-slab', label: 'text-on-pandan', on: 'onPandan' },
  kaya: { fill: 'bg-kaya', slab: 'bg-kaya-slab', label: 'text-on-kaya', on: 'onKaya' },
  water: { fill: 'bg-water', slab: 'bg-water-slab', label: 'text-on-water', on: 'onWater' },
  hibiscus: {
    fill: 'bg-hibiscus',
    slab: 'bg-hibiscus-slab',
    label: 'text-on-hibiscus',
    on: 'onHibiscus',
  },
} as const

export type AvatarSize = keyof typeof sizes
export type AvatarTone = (typeof tones)[number]

export type AvatarProps = {
  /**
   * Full name, or empty for an account that has not given one. The initial and
   * the tone are derived from it, and it is the a11y label unless one is passed.
   */
  name: string
  /**
   * What a screen reader says. Pass it when `name` is empty — "—" is what the
   * layout shows in that case and not something worth reading out.
   */
  accessibilityLabel?: string
  /** Remote or local image. Falls back to the initial while loading or on error. */
  uri?: string | null
  size?: AvatarSize
  /** Pin the colour. By default it is derived from the name, so it is stable. */
  tone?: AvatarTone
  className?: string
}

/**
 * Derives a stable tone from the name.
 *
 * Deterministic on purpose: a user's avatar colour should not change when a
 * list re-sorts, and picking at random or by array index does exactly that.
 */
function toneFor(name: string): AvatarTone {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return tones[Math.abs(hash) % tones.length]
}

/**
 * Whether this name is a name, or a placeholder standing in for one.
 *
 * Nobody is asked for a name any more — signing in is a link in an email — so
 * `display_name` is empty for most accounts, and the screens pass an em dash
 * where a name would go. An avatar reading "—" or "?" looks like a rendering
 * fault; the stock figure below looks like an account with no picture yet, which
 * is what it is.
 */
const isRealName = (name: string) => /\p{L}/u.test(name)

/** Rounded-square avatar with a stock figure behind the initial. */
export function Avatar({
  name,
  accessibilityLabel,
  uri,
  size = 'md',
  tone,
  className,
}: AvatarProps) {
  const metrics = sizes[size]
  const palette = fills[tone ?? toneFor(name)]
  const colors = useThemeColors()
  const named = isRealName(name)
  const initial = name.trim().charAt(0).toUpperCase()

  return (
    <Squish
      depth={slab.md}
      radius={metrics.radius}
      containerClassName={cn('self-start', className)}
      slabClassName={palette.slab}
      className={cn('items-center justify-center overflow-hidden', palette.fill)}
      accessibilityLabel={accessibilityLabel ?? name}
    >
      <View
        style={{ width: metrics.box, height: metrics.box }}
        className="items-center justify-center"
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={{ width: metrics.box, height: metrics.box }}
            contentFit="cover"
          />
        ) : named ? (
          <Text className={cn('font-display', metrics.font, palette.label)}>{initial}</Text>
        ) : (
          // Flattened to the tile's own foreground colour, so it reads as a
          // silhouette rather than as the teal-and-cream drawing it is in a list
          // of settings icons.
          <Icon
            set="ui"
            name="profile"
            size={Math.round(metrics.box * 0.62)}
            tintColor={colors[palette.on]}
          />
        )}
      </View>
    </Squish>
  )
}

export type AvatarGroupProps = {
  names: readonly string[]
  /** How many to draw before collapsing the rest into a "+N" tile. */
  max?: number
  size?: AvatarSize
  className?: string
}

/** Overlapping avatars with a "+N" overflow tile. */
export function AvatarGroup({ names, max = 3, size = 'sm', className }: AvatarGroupProps) {
  const shown = names.slice(0, max)
  const overflow = names.length - shown.length
  const box = sizes[size].box

  return (
    <View
      className={cn('flex-row items-center', className)}
      accessibilityLabel={`${names.length} members`}
    >
      {shown.map((name, index) => (
        <View key={name} style={index > 0 ? { marginLeft: -10 } : undefined}>
          <Avatar name={name} size={size} />
        </View>
      ))}
      {overflow > 0 ? (
        <View
          className="items-center justify-center rounded-sm border-[3px] border-surface bg-track"
          style={{
            width: box,
            height: box,
            marginLeft: shown.length ? -10 : 0,
            // Avatars are raised on a slab, so their visible face sits `slab.md`
            // above the bottom of their box. Without the same offset this flat
            // tile hangs low and the row looks broken.
            marginBottom: slab.md,
          }}
        >
          <Text variant="caption">+{overflow}</Text>
        </View>
      ) : null}
    </View>
  )
}
