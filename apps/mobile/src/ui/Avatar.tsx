import { Image } from 'expo-image'
import type { ReactNode } from 'react'
import { View } from 'react-native'

import { radius as radiusScale } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { Icon } from './Icon'
import { Squish } from './Squish'
import { Text } from './Text'

const sizes = {
  /** Beside a chat bubble, where a 40pt face outweighs one line of text. */
  xs: { box: 30, radius: 11, font: 'text-[12px] leading-[15px]' },
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
  /** Remote or local image. Falls back to `fallback` while loading or on error. */
  uri?: string | null
  /**
   * What to cache the picture under, when `uri` is a signed URL that gets
   * re-minted for bytes that do not change. Without it the cache is keyed on
   * the URL, so a fresh signature reads as a different image and re-downloads
   * one that is already on disk. Pass the stored key, never the URL.
   */
  cacheKey?: string
  /**
   * What to draw with no picture: a stock figure, or the name's first letter.
   *
   * The figure is the default because the app's own user is the common case and
   * has no name to take a letter from — nobody is asked for one, since signing in
   * is a link in an email. `initial` is for a row of NAMED people, where the
   * letters are what tell them apart and the same silhouette four times over
   * tells you nothing.
   */
  fallback?: 'figure' | 'initial'
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
 * Whether there is a letter here worth showing, or only padding.
 *
 * Deliberately NOT `/\p{L}/u`. Unicode property escapes are a Hermes support
 * question, and a regexp literal Hermes cannot parse throws where it is defined —
 * at module scope, in a design-system file every screen imports, which is a blank
 * app rather than a bad avatar. This asks the same question the other way round:
 * is there anything here that is not whitespace or a placeholder mark. Which also
 * keeps it right for a name in a script with no case, or no letters this file
 * could name.
 */
const isRealName = (name: string) => /[^\s\-–—_.·?]/.test(name)

/** Rounded-square avatar: a picture, a stock figure, or an initial. */
export function Avatar({
  name,
  accessibilityLabel,
  uri,
  cacheKey,
  fallback = 'figure',
  size = 'md',
  tone,
  className,
}: AvatarProps) {
  const metrics = sizes[size]
  const palette = fills[tone ?? toneFor(name)]
  const colors = useThemeColors()
  // A letter is only ever shown where one was asked for AND there is one to show.
  const showInitial = fallback === 'initial' && isRealName(name)
  const initial = name.trim().charAt(0).toUpperCase()

  return (
    <Squish
      // Flat, with or without a picture. A raised slab under a drawn face made
      // it taller than a photo beside it, so a row of mixed faces never lined
      // up, and a Pro ring framed the face and left the slab hanging below.
      depth={0}
      radius={metrics.radius}
      containerClassName={cn('self-start', className)}
      className={cn('items-center justify-center overflow-hidden', palette.fill)}
      accessibilityLabel={accessibilityLabel ?? name}
    >
      <View
        style={{ width: metrics.box, height: metrics.box }}
        className="items-center justify-center"
      >
        {uri ? (
          <Image
            source={{ uri, cacheKey }}
            style={{ width: metrics.box, height: metrics.box }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : showInitial ? (
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
  /** Everyone in the group, when `names` is only the first few of them. */
  total?: number
  /** How many to draw before collapsing the rest into a "+N" tile. */
  max?: number
  size?: AvatarSize
  /**
   * Draws one person's tile instead of their initial, for a caller that can
   * show their picture. Signing a picture is a feature's business, not this
   * component's.
   */
  renderAvatar?: (name: string, index: number) => ReactNode
  className?: string
}

/** Overlapping avatars with a "+N" overflow tile. */
export function AvatarGroup({
  names,
  total,
  max = 3,
  size = 'sm',
  renderAvatar,
  className,
}: AvatarGroupProps) {
  const shown = names.slice(0, max)
  const overflow = (total ?? names.length) - shown.length
  const box = sizes[size].box

  return (
    <View
      className={cn('flex-row items-center', className)}
      accessibilityLabel={`${total ?? names.length} members`}
    >
      {shown.map((name, index) => (
        // Names repeat (two Alexes in one group), and a short fixed list never
        // reorders, so the place is the key.
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <View key={index} style={index > 0 ? { marginLeft: -10 } : undefined}>
          {/* Letters here, not silhouettes: these are named people, and the
              initial is the only thing telling one tile from the next. */}
          {renderAvatar?.(name, index) ?? <Avatar name={name} fallback="initial" size={size} />}
        </View>
      ))}
      {overflow > 0 ? (
        <View
          className="items-center justify-center rounded-sm border-[3px] border-surface bg-track"
          style={{
            width: box,
            height: box,
            marginLeft: shown.length ? -10 : 0,
          }}
        >
          <Text variant="caption">+{overflow}</Text>
        </View>
      ) : null}
    </View>
  )
}

/**
 * The bevel that makes the ring read as metal rather than as a yellow line:
 * light catches the top edge and the rest is plain gold. The same in both
 * themes, because gold is the point and a dark-mode gold is brown. Without a
 * deep bottom edge, which read as brown on the smallest faces.
 */
const GOLD = { light: '#FFE69A', mid: '#F2BE2E' } as const

/**
 * A gold ring round a Pro member's face, for status.
 *
 * Drawn on the avatar's own edge rather than outside it, so a face with a
 * ring keeps exactly the size and alignment of one without: a list never
 * reflows when somebody subscribes, and a row of names stays in line. Static:
 * a shimmer would be a running animation per face in a scrolling list.
 */
export function ProRing({
  pro,
  size = 'md',
  children,
}: {
  pro?: boolean | null
  size?: AvatarSize
  children: ReactNode
}) {
  const metrics = sizes[size]
  const width = size === 'xs' ? 2 : size === 'lg' ? 3.5 : 2.5
  // The wrapper is there either way, so a ring arriving with the entitlement
  // adds a sibling rather than remounting the face (and its image) under a
  // new parent.
  return (
    <View>
      {children}
      {pro ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: metrics.box,
            height: metrics.box,
            borderRadius: metrics.radius,
            borderWidth: width,
            borderTopColor: GOLD.light,
            borderLeftColor: GOLD.mid,
            borderRightColor: GOLD.mid,
            borderBottomColor: GOLD.mid,
          }}
        />
      ) : null}
    </View>
  )
}
