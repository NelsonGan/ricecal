import { type AvatarAction, type AvatarMood, moodPose, type Pose } from './mood'

/**
 * How the avatar moves, as data (README: The avatar on Today, *How it moves*).
 *
 * A motion is a set of tracks, each a list of `[time, value]` keys for one
 * channel of one bone, sampled on the UI thread every frame. Between two keys
 * the value eases in and out; an overshoot is an extra key past the target.
 * The drawings only change at pose boundaries (`segments`), so the movement
 * between them is all transforms, and nothing on the JavaScript side runs
 * while a motion plays.
 *
 * Adding a motion (a wave, a walk across a group's board) is a new entry in
 * `ACTIONS`: its tracks and its poses. Idle motion loops forever under every
 * action, with a per-figure phase so a crowd does not breathe in step.
 */

export type Key = readonly [number, number]
export type Track = readonly Key[]

/** The channels a motion can drive. Rotations in degrees, offsets in canvas units. */
export type Channels = {
  /** The eating arm: 0 resting low, 1 at the mouth. */
  lift: Track
  headRotate: Track
  headY: Track
  /** Cheeks and jaw: the head squashes toward the neck while chewing. */
  headSquash: Track
  /** The whole figure, from the feet: < 1 is squashed, > 1 stretched. */
  bodySquash: Track
  bodyY: Track
  /** How much of the mood's resting lean shows, 0 to 1. */
  lean: Track
}

export type Segment = { from: number; pose: Pose }

export type Motion = {
  /** The mood the motion ends on. */
  mood: AvatarMood
  duration: number
  channels: Partial<Channels>
  /** The poses in order; each lasts until the next one starts. */
  segments: Segment[]
}

/** Every channel's value when nothing is playing. */
export const REST: Record<keyof Channels, number> = {
  lift: 0,
  headRotate: 0,
  headY: 0,
  headSquash: 1,
  bodySquash: 1,
  bodyY: 0,
  lean: 1,
}

/** Cross-fade when one drawing replaces another, in ms. */
export const DISSOLVE_MS = 70

export function sample(track: Track | undefined, t: number, rest: number): number {
  'worklet'
  if (!track || track.length === 0) return rest
  const first = track[0] as Key
  if (t <= first[0]) return first[1]
  for (let i = 1; i < track.length; i++) {
    const b = track[i] as Key
    if (t <= b[0]) {
      const a = track[i - 1] as Key
      const p = (t - a[0]) / (b[0] - a[0] || 1)
      // smoothstep: eases out of one key and into the next
      return a[1] + (b[1] - a[1]) * p * p * (3 - 2 * p)
    }
  }
  return (track[track.length - 1] as Key)[1]
}

/**
 * Eating, about 2.2 s: a small wind-up, the spoon up with the head leaning to
 * meet it, the bite, chewing while the empty spoon comes down, the hand back
 * on the tummy, a contented bounce, then the day's (possibly new) mood.
 */
function eating(mood: AvatarMood, holding: boolean): Motion {
  const eat = (face: Pose['face'], spoon: Pose['spoon']): Pose => ({
    face,
    armL: 'belly',
    armR: 'eat',
    effect: null,
    spoon,
  })
  const chewing = (from: number, to: number, depth: number): Key[] => {
    const keys: Key[] = []
    for (let t = from; t < to; t += 160) keys.push([t, 1], [t + 80, 1 - depth])
    keys.push([to, 1])
    return keys
  }
  return {
    mood,
    duration: 2200,
    segments: [
      { from: 0, pose: eat('bite', 'full') },
      { from: 560, pose: eat('chew', 'empty') },
      { from: 1360, pose: { ...eat('chew', null), armR: 'belly' } },
      { from: 1760, pose: moodPose(mood, holding) },
    ],
    channels: {
      lift: [
        [0, 0],
        [150, -0.15],
        [470, 1.06],
        [560, 1],
        [640, 0.9],
        [980, 0.9],
        [1340, 0],
      ],
      headRotate: [
        [0, 0],
        [150, -2],
        [470, 3],
        [600, 1],
        [800, -1.5],
        [1050, 1.5],
        [1300, -1],
        [1550, 0],
      ],
      headY: [
        [0, 0],
        [150, -4],
        [470, 5],
        [560, 9],
        [680, 3],
        [1500, 2],
        [1700, 0],
      ],
      headSquash: [[0, 1], [600, 1], ...chewing(640, 1440, 0.035)],
      bodySquash: [
        [0, 1],
        [150, 0.975],
        [330, 1.012],
        [470, 1],
        [580, 0.985],
        [700, 1],
        [1760, 1],
        [1860, 1.025],
        [1980, 0.992],
        [2100, 1],
      ],
      bodyY: [
        [0, 0],
        [1760, 0],
        [1860, -6],
        [1980, 0],
      ],
      lean: [
        [0, 1],
        [200, 0],
        [1760, 0],
        [2100, 1],
      ],
    },
  }
}

export const ACTIONS: Record<AvatarAction, (mood: AvatarMood, holding: boolean) => Motion> = {
  eating,
}

/** How far the figure leans back from its feet, for a tummy that is full. */
export const MOOD_LEAN: Record<AvatarMood, number> = {
  hungry: 0,
  onTrack: 0,
  close: 0,
  satisfied: 0,
  over: -2,
  stuffed: -4,
}

/** One loop of the idle motion, in ms. Every idle wave fits it a whole number of times. */
export const IDLE_MS = 6400

/** Breathing, a small nod and a tilt, and the mood's own fidget. Worklet. */
export function idle(t: number, mood: AvatarMood) {
  'worklet'
  const w = (2 * Math.PI) / IDLE_MS
  const breath = Math.sin(t * w * 2)
  const slow = Math.sin(t * w)
  const heavy = mood === 'over' || mood === 'stuffed'
  return {
    bodySquash: 1 + (heavy ? 0.016 : 0.01) * breath,
    headY: 1.6 * Math.sin(t * w * 2 - 0.9),
    headRotate: 1.2 * slow,
    // hungry shifts from foot to foot
    sway: mood === 'hungry' ? 1.8 * Math.sin(t * w * 3) : 0,
    fxY: -6 * (0.5 + 0.5 * Math.sin(t * w * 4)),
    fxOpacity: 0.7 + 0.3 * Math.sin(t * w * 4 + 1.2),
  }
}

/**
 * Opacity of a drawing shown during `windows` (each `[from, to)`), fading in
 * over `DISSOLVE_MS` and cut when the next drawing has finished fading in over
 * it, so two drawings are never both half-transparent. Worklet.
 */
export function windowOpacity(t: number, windows: readonly (readonly [number, number])[]): number {
  'worklet'
  let o = 0
  for (const [from, to] of windows) {
    if (t < from || t >= to + DISSOLVE_MS) continue
    const v = from === 0 ? 1 : Math.min(1, (t - from) / DISSOLVE_MS)
    if (v > o) o = v
  }
  return o
}
