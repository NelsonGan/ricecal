/**
 * How the day is going, as the avatar shows it (README: The avatar on Today).
 *
 * Derived from the same two numbers the ring draws, what was eaten and the
 * day's budget, so the avatar and the ring can never disagree about the day.
 */

export type AvatarMood = 'hungry' | 'onTrack' | 'close' | 'satisfied' | 'over' | 'stuffed'

export const MOODS: readonly AvatarMood[] = [
  'hungry',
  'onTrack',
  'close',
  'satisfied',
  'over',
  'stuffed',
]

/**
 * Where one mood hands over to the next, as a share of the budget.
 *
 * Satisfied is a band either side of the target rather than the exact number:
 * nobody lands on 1,850 to the calorie, and a day that ends forty over is a day
 * that went to plan. Past the band the avatar is "very full", drawn as puffed
 * cheeks and hands on the tummy, and well past it "stuffed", a cartoon food
 * coma with swirly eyes and a burp. Both are jokes about a big feast, never a
 * bigger body or a sad face: going over is not a failure the app tells anybody
 * off for.
 */
export const MOOD_THRESHOLDS = {
  close: 0.75,
  satisfied: 0.95,
  over: 1.05,
  stuffed: 1.3,
} as const

export function calorieMood({
  eatenKcal,
  budgetKcal,
  logged,
}: {
  eatenKcal: number
  budgetKcal: number
  /** Whether anything at all is on the day, which a zero-calorie drink still is. */
  logged: boolean
}): AvatarMood {
  if (!logged && eatenKcal <= 0) return 'hungry'
  if (!(budgetKcal > 0)) return 'onTrack'
  const share = eatenKcal / budgetKcal
  if (share > MOOD_THRESHOLDS.stuffed) return 'stuffed'
  if (share > MOOD_THRESHOLDS.over) return 'over'
  if (share >= MOOD_THRESHOLDS.satisfied) return 'satisfied'
  if (share >= MOOD_THRESHOLDS.close) return 'close'
  return 'onTrack'
}

/**
 * Something the avatar does once and then returns to its mood from. Only
 * eating for now: it plays when a meal lands on the day.
 */
export type AvatarAction = 'eating'

export type AvatarState = {
  mood: AvatarMood
  /** Plays once, then `onActionEnd` fires and the mood shows again. */
  action?: AvatarAction
}

export type ArmPose = 'pocket' | 'belly' | 'thumb' | 'hold' | 'eat'
export type FaceKey =
  | 'hungry'
  | 'on-track'
  | 'close'
  | 'satisfied'
  | 'over'
  | 'stuffed'
  | 'bite'
  | 'chew'
export type Effect = 'rumble' | 'sparkle' | 'puff' | 'stuffed'

/** Everything about the figure that is not the outfit: what the face and arms do. */
export type Pose = {
  face: FaceKey
  armL: ArmPose
  armR: ArmPose
  effect: Effect | null
  /** The spoon in the eating hand: heaped before the bite, empty after it. */
  spoon: 'full' | 'empty' | null
}

const MOOD_FACE: Record<AvatarMood, FaceKey> = {
  hungry: 'hungry',
  onTrack: 'on-track',
  close: 'close',
  satisfied: 'satisfied',
  over: 'over',
  stuffed: 'stuffed',
}

const MOOD_ARMS: Record<AvatarMood, [ArmPose, ArmPose]> = {
  // a hand on a rumbling tummy, the other in a pocket
  hungry: ['belly', 'pocket'],
  // the chill default: both hands in pockets
  onTrack: ['pocket', 'pocket'],
  close: ['pocket', 'thumb'],
  satisfied: ['belly', 'belly'],
  over: ['belly', 'belly'],
  stuffed: ['belly', 'belly'],
}

const MOOD_EFFECT: Record<AvatarMood, Effect | null> = {
  hungry: 'rumble',
  onTrack: null,
  close: null,
  satisfied: 'sparkle',
  over: 'puff',
  stuffed: 'stuffed',
}

/** The resting pose for a mood. Something held takes the right hand. */
export function moodPose(mood: AvatarMood, holding: boolean): Pose {
  let [armL, armR] = MOOD_ARMS[mood]
  if (holding) {
    // The thumbs up moves to the free hand rather than disappearing.
    if (armR === 'thumb') armL = 'thumb'
    armR = 'hold'
  }
  return { face: MOOD_FACE[mood], armL, armR, effect: MOOD_EFFECT[mood], spoon: null }
}
