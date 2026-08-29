import type { ReactNode } from 'react'
import { ActivityIndicator, View } from 'react-native'

import type { IconRef } from '@/data'
import { storedImageSource, useMealPhotoUrl } from '@/data'
import { cn, Icon, Skeleton, Tappable, Text } from '@/ui'
import { MealPhoto } from './MealPhoto'

const valueTones = {
  ink: 'text-ink',
  hibiscus: 'text-hibiscus-ink',
} as const

/**
 * The picture tile, and the indent owed to anything lining up with the text
 * beside it.
 *
 * Exported because four places have to agree on one number: this row, the
 * analysing row that stands in mid-scan, the review badge that indents to a
 * recipe's text column, and the recipes skeleton. They drifted once already, 56pt
 * in one place and 48 in another.
 *
 * Literal class strings rather than a number interpolated into one: NativeWind
 * compiles the stylesheet from the source text, so a class it cannot read before
 * the app runs produces no style at all.
 */
export const ROW_TILE = 'h-[72px] w-[72px]'
/** Tile plus the row's `gap-3`. */
export const ROW_TEXT_INDENT = 'pl-[84px]'
export const ROW_TILE_ICON = 52

/**
 * What a row shows when it has neither a photograph nor a drawing of its own.
 *
 * There was also a `textOnly` prop that dropped the tile, for catalogue search
 * results where a drawing was the rare exception and a column of identical
 * plates indented every dish name for the sake of the few that had one. That
 * was true at 35% icon coverage; `icon-match.ts` took it to 73.5%, so the
 * majority row now has a picture and the exception is the blank. Both callers
 * pass the food's own icon instead, and the prop is gone.
 */
const PLACEHOLDER_ICON = { set: 'food', name: 'empty-plate' } as const

export type ItemRowProps = {
  /** The dish, the thing. */
  title: string
  /** "1 plate", "8:20 am", "Mamak · 1 piece". */
  detail?: string
  /**
   * Optional, because most of the catalogue has no drawing: millions of imported
   * foods against a few hundred illustrations. A row with neither an icon nor a
   * photo falls back to `PLACEHOLDER_ICON`.
   */
  icon?: IconRef
  /**
   * A photo to show in place of the illustration, as a local `file://` uri —
   * a plate that has been snapped but not uploaded yet.
   */
  photoUri?: string
  /**
   * The same, for a photo already in the bucket. Resolved to a signed URL here
   * rather than by every caller: the bucket is private, so a stored photo is
   * always one query away from being renderable, and doing it in the row keeps
   * that fact in one place. An object that has gone falls back to the icon, and
   * then to the placeholder, so a row is never blank.
   */
  photoPath?: string
  /** The number on the right. */
  value: number | string
  /** What the number is in. Omit for a unitless count. */
  unit?: string
  /** Calories burned read in hibiscus; everything else in ink. */
  valueTone?: keyof typeof valueTones
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
  busy = false,
  trailing,
  onPress,
  className,
}: ItemRowProps) {
  const { data: photoUrl, isLoading: resolving } = useMealPhotoUrl(photoPath)
  const photo = storedImageSource(photoPath, photoUrl, photoUri)

  const tile = (
    <View
      className={cn(ROW_TILE, 'items-center justify-center overflow-hidden rounded-tile bg-track')}
    >
      {photo ? (
        <MealPhoto source={photo} dimmed={busy} />
      ) : resolving ? (
        // Not an icon, and not nothing: a snapped row's `icon` is undefined by
        // design — the view suppresses it while a photo exists — so the choice
        // here is between a pulse and a bare grey square that gives no reason
        // for itself.
        // `bg-line` rather than the skeleton's own `bg-track`, which is what
        // the tile behind it already is — track on track does not pulse.
        <Skeleton width="100%" height={72} rounded={false} className="bg-line" />
      ) : busy ? null : (
        <Icon {...(icon ?? PLACEHOLDER_ICON)} size={ROW_TILE_ICON} />
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
      {tile}

      <View className="min-w-0 flex-1 gap-0.5">
        {/* Two lines, which the tile pays for. A dish name is the longest thing
            on the row and the tile took width from it — "Char kuey teow with
            prawns" truncated to "Char kuey teow wi…", which is the half that
            says least. Both lines plus the detail come to 69pt against a 72pt
            tile, so a wrapped title costs no height and the rows stay even. */}
        <Text variant="bodyStrong" numberOfLines={2}>
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

  const classes = cn('flex-row items-center gap-3 rounded-tile', className)

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
