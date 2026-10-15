import { Image } from 'expo-image'
import { View } from 'react-native'

import type { IconRef } from '@/data'
import { cn, Icon } from '@/ui'
import type { Category } from './catalogue'
import { EXERCISE_ART } from './exerciseArt.generated'

/**
 * An exercise's drawing on its tile.
 *
 * Every built-in exercise has one made for it. A custom exercise (or an id the
 * catalogue has since retired) draws the body-part icon instead, which is the
 * most a name typed by the user can honestly be pictured as.
 *
 * The tile is `exercise-tile`, which stays pale in dark mode too: the drawings
 * carry grey equipment that reads on a pale tile and disappears on a dark card.
 */

const FALLBACK: Record<Category, IconRef> = {
  chest: { set: 'body', name: 'push-up' },
  back: { set: 'body', name: 'weight-plate' },
  shoulders: { set: 'body', name: 'dumbbell' },
  arms: { set: 'body', name: 'muscle' },
  legs: { set: 'body', name: 'squat' },
  core: { set: 'body', name: 'sit-up' },
  fullBody: { set: 'body', name: 'kettlebell' },
  cardio: { set: 'body', name: 'running' },
  mobility: { set: 'body', name: 'stretching' },
}

/**
 * The icon-set drawing closest to an exercise, for the places that draw from
 * the icon set rather than the exercise art: a workout's row on Today sits
 * among food rows and takes their tile. Cardio and mobility with a drawing of
 * their own get it; lifting gets the dumbbell.
 */
const OWN_ICON: Record<string, IconRef> = {
  swimming: { set: 'body', name: 'swimming' },
  running: { set: 'body', name: 'running' },
  treadmill: { set: 'body', name: 'treadmill' },
  walking: { set: 'body', name: 'walking' },
  hiking: { set: 'body', name: 'hiking' },
  cycling: { set: 'body', name: 'cycling' },
  'stationary-bike': { set: 'body', name: 'cycling' },
  'rowing-machine': { set: 'body', name: 'rowing' },
  'jump-rope': { set: 'body', name: 'jump-rope' },
  yoga: { set: 'body', name: 'yoga-mat' },
  pilates: { set: 'body', name: 'yoga-mat' },
  stretching: { set: 'body', name: 'stretching' },
  dance: { set: 'body', name: 'dancing' },
  zumba: { set: 'body', name: 'dancing' },
  'stair-climber': { set: 'body', name: 'stairs' },
}

export function exerciseIcon(exerciseId: string): IconRef {
  return OWN_ICON[exerciseId] ?? { set: 'body', name: 'dumbbell' }
}

export type ExerciseArtProps = {
  exerciseId: string
  /** The body part, whose icon stands in where the exercise has no drawing. */
  category?: Category
  size: number
  /** Tile corner radius; defaults to a third of the size, which reads as a soft square. */
  radius?: number
  className?: string
}

export function ExerciseArt({
  exerciseId,
  category = 'fullBody',
  size,
  radius,
  className,
}: ExerciseArtProps) {
  const source = EXERCISE_ART[exerciseId]
  const icon = FALLBACK[category]

  return (
    <View
      className={cn('items-center justify-center overflow-hidden bg-exercise-tile', className)}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size / 3.2) }}
    >
      {source ? (
        <Image
          source={source}
          contentFit="contain"
          style={{ width: size * 0.92, height: size * 0.92 }}
          transition={0}
          accessible={false}
        />
      ) : (
        <Icon {...icon} size={Math.round(size * 0.62)} />
      )}
    </View>
  )
}
