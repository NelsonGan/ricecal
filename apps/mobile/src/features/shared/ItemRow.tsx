import { Image } from 'expo-image'
import type { ReactNode } from 'react'
import { ActivityIndicator, View } from 'react-native'

import type { IconRef } from '@/data'
import { useMealPhotoUrl } from '@/data'
import { cn, Icon, Tappable, Text } from '@/ui'

const valueTones = {
  ink: 'text-ink',
  hibiscus: 'text-hibiscus-ink',
} as const

export type ItemRowProps = {
  /** The dish, the thing. */
  title: string
  /** "1 plate", "8:20 am", "Mamak · 1 piece". */
  detail?: string
  /**
   * Optional, because most of the catalogue has no drawing: there are hundreds of
   * megabytes of imported foods and a few dozen illustrations. With neither an
   * icon nor a photo the tile stays an empty square, which keeps every row the
   * same shape and the names in one column — better than the same stand-in plate
   * beside a thousand different dishes.
   */
  icon?: IconRef
  /**
   * Drops the tile entirely rather than leaving it empty.
   *
   * For a list where NO row has a picture — search results out of the catalogue —
   * a column of empty squares is 56pt of nothing on every row, and it indents the
   * one thing being read. A logged row keeps its tile even when empty, because its
   * neighbours have photos and a ragged left edge is worse.
   */
  textOnly?: boolean
  /**
   * A photo to show in place of the illustration, as a local `file://` uri —
   * a plate that has been snapped but not uploaded yet.
   */
  photoUri?: string
  /**
   * The same, for a photo already in the bucket. Resolved to a signed URL here
   * rather than by every caller: the bucket is private, so a stored photo is
   * always one query away from being renderable, and doing it in the row keeps
   * that fact in one place. `icon` stays required as the fallback, so a row is
   * never blank if the object has gone.
   */
  photoPath?: string
  /** The number on the right. */
  value: number | string
  /** What the number is in. Omit for a unitless count. */
  unit?: string
  /** Calories burned read in hibiscus; everything else in ink. */
  valueTone?: keyof typeof valueTones
  /** Highlights the row — used for the entry that was just added. */
  highlighted?: boolean
  /**
   * The row is waiting on something. A spinner replaces the value, and the
   * photo tile dims — a snapped plate whose dish is still being worked out.
   */
  busy?: boolean
  /** Sits after the value. An add button, a match badge. */
  trailing?: ReactNode
  onPress?: () => void
  className?: string
}

/**
 * The row that carries almost every list in the app: a dish on Today, a search
 * result, a top food, a locked entry behind the paywall.
 *
 * One component rather than six near-copies, because near-copies drift — the
 * tile was 56pt in one place and 48 in another, the gap 12 here and 14 there,
 * and the calorie count sat on a different baseline depending on the screen.
 */
export function ItemRow({
  title,
  detail,
  icon,
  photoUri,
  photoPath,
  value,
  unit,
  valueTone = 'ink',
  highlighted = false,
  busy = false,
  textOnly = false,
  trailing,
  onPress,
  className,
}: ItemRowProps) {
  const { data: signedUrl } = useMealPhotoUrl(photoPath)
  const photo = photoUri ?? signedUrl

  const tile = (
    <View className="h-[56px] w-[56px] items-center justify-center overflow-hidden rounded-tile bg-track">
      {photo ? (
        // The tile is square and a plate photo is not, so it crops rather than
        // letterboxing — a 4:3 photo in a 1:1 tile with bars reads as a broken
        // image.
        <Image
          source={{ uri: photo }}
          style={{ flex: 1, width: '100%', opacity: busy ? 0.55 : 1 }}
          contentFit="cover"
        />
      ) : busy || !icon ? null : (
        <Icon {...icon} size={40} />
      )}
      {/* Over the photo rather than beside it: the thing being worked on is the
          picture, and the row has no spare width at this size. With no photo the
          tile is the spinner alone — an illustration under it would be a dish
          this row does not yet have. */}
      {busy ? (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator size="small" />
        </View>
      ) : null}
    </View>
  )

  const body = (
    <>
      {textOnly ? null : tile}

      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text variant="meta" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>

      {busy ? null : (
        <View className="flex-row items-baseline gap-1">
          <Text
            variant="numeric"
            className={cn('text-[19px] leading-[24px]', valueTones[valueTone])}
          >
            {typeof value === 'number' ? value.toLocaleString() : value}
          </Text>
          {unit ? <Text variant="caption">{unit}</Text> : null}
        </View>
      )}

      {trailing}
    </>
  )

  const classes = cn(
    'flex-row items-center gap-3 rounded-tile',
    highlighted && 'bg-pandan-soft p-2.5',
    className,
  )

  if (!onPress) {
    return <View className={classes}>{body}</View>
  }

  return (
    <Tappable
      className={classes}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ busy }}
      accessibilityLabel={[
        title,
        busy ? undefined : unit ? `${value} ${unit}` : String(value),
        detail,
      ]
        .filter(Boolean)
        .join(', ')}
    >
      {body}
    </Tappable>
  )
}
