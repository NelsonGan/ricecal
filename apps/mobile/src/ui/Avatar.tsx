import { Image } from 'expo-image'
import { View } from 'react-native'

import { radius as radiusScale, slab } from '@/theme/tokens'
import { cn } from './cn'
import { Squish } from './Squish'
import { Text } from './Text'

const sizes = {
  sm: { box: 40, radius: 14, font: 'text-[15px] leading-[18px]' },
  md: { box: 52, radius: 18, font: 'text-[20px] leading-[24px]' },
  lg: { box: 64, radius: radiusScale.sheet, font: 'text-[26px] leading-[30px]' },
} as const

const tones = ['pandan', 'kaya', 'water', 'hibiscus'] as const
const fills = {
  pandan: { fill: 'bg-pandan', slab: 'bg-pandan-slab', label: 'text-on-pandan' },
  kaya: { fill: 'bg-kaya', slab: 'bg-kaya-slab', label: 'text-on-kaya' },
  water: { fill: 'bg-water', slab: 'bg-water-slab', label: 'text-on-water' },
  hibiscus: { fill: 'bg-hibiscus', slab: 'bg-hibiscus-slab', label: 'text-on-hibiscus' },
} as const

export type AvatarSize = keyof typeof sizes
export type AvatarTone = (typeof tones)[number]

export type AvatarProps = {
  /** Full name. The initial is derived from it; also used as the a11y label. */
  name: string
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

/** Rounded-square avatar with an initial fallback. */
export function Avatar({ name, uri, size = 'md', tone, className }: AvatarProps) {
  const metrics = sizes[size]
  const palette = fills[tone ?? toneFor(name)]
  const initial = name.trim().charAt(0).toUpperCase() || '?'

  return (
    <Squish
      depth={slab.md}
      radius={metrics.radius}
      containerClassName={cn('self-start', className)}
      slabClassName={palette.slab}
      className={cn('items-center justify-center overflow-hidden', palette.fill)}
      accessibilityLabel={name}
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
        ) : (
          <Text className={cn('font-display', metrics.font, palette.label)}>{initial}</Text>
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
