import type { HrZones } from './types'

/**
 * Heart rate samples to seconds in four bands.
 *
 * Four rather than the conventional five: zone 1 against zone 2 is a distinction
 * for people following a training plan, and everyone else reads "mostly cruising,
 * with a hard bit near the end".
 *
 * The thresholds are a fraction of maximum rather than of reserve, because
 * Karvonen is the better model and needs a resting heart rate many of these
 * sessions do not carry.
 *
 * The maximum is estimated from age, since a measured one needs a maximal effort
 * nobody has performed for us. Tanaka (208 - 0.7 x age) rather than 220 - age,
 * which comes from a 1970s eyeball fit and under-reads by about ten beats for
 * anyone over fifty, putting an older user in Peak for a brisk walk.
 */

export function estimatedMaxHr(age: number | null): number {
  // 40 is the median age of nobody in particular. It is what the bands fall
  // back to when the profile has no birth date, and it is stated here rather
  // than at the call site so every caller falls back the same way.
  const years = age ?? 40
  return Math.round(208 - 0.7 * years)
}

const BANDS = {
  easy: 0.6,
  steady: 0.7,
  hard: 0.85,
} as const

/**
 * The fewest readings that will be banded.
 *
 * Below ten a session has no shape to draw, and four bars over three readings
 * are a texture invented for a workout rather than measured from it.
 *
 * Exported because it is also the question `apple.ts` asks of its FIRST answer.
 * A recorder that attaches a handful of samples to a workout satisfies "did we
 * get anything" while leaving nothing to band, and a reader that stops there
 * puts an average on the screen over an empty chart.
 */
export const MIN_ZONE_SAMPLES = 10

export type HeartBeatSample = {
  bpm: number
  /**
   * Epoch ms of the reading.
   *
   * Only the start. A sample's END was carried here too at first and never
   * read: a band is measured by how long it was until the NEXT reading, not by
   * how long the store says one instant lasted, so the end never entered the
   * arithmetic and both providers were populating it for nothing.
   */
  at: number
}

/**
 * Samples to a zone breakdown, or null if there is not enough to say anything.
 *
 * Each sample holds until the next one starts, which is what makes this a
 * duration rather than a count — a watch writes heart rate every few seconds
 * while moving and every few minutes while still, and counting samples would
 * report a rest day as mostly Peak.
 *
 * The last sample is given the median gap of the ones before it rather than
 * zero (which loses a beat) or the rest of the session (which invents one).
 */
export function hrZonesFromSamples(
  samples: readonly HeartBeatSample[],
  age: number | null = null,
): HrZones | null {
  if (samples.length < MIN_ZONE_SAMPLES) return null

  const ordered = [...samples].sort((a, b) => a.at - b.at)
  const max = estimatedMaxHr(age)

  const gaps: number[] = []
  for (let i = 1; i < ordered.length; i++) {
    gaps.push((ordered[i].at - ordered[i - 1].at) / 1000)
  }
  gaps.sort((a, b) => a - b)
  const medianGap = gaps[Math.floor(gaps.length / 2)] || 1

  const zones: HrZones = { easy: 0, steady: 0, hard: 0, peak: 0 }

  for (let i = 0; i < ordered.length; i++) {
    const next = ordered[i + 1]
    // Capped at two minutes. A watch that stopped recording mid-session — the
    // wrist went slack, the app was killed — otherwise donates the whole gap to
    // whichever band the last beat happened to be in.
    const seconds = next
      ? Math.min(120, Math.max(0, (next.at - ordered[i].at) / 1000))
      : Math.min(120, medianGap)

    const share = ordered[i].bpm / max
    if (share < BANDS.easy) zones.easy += seconds
    else if (share < BANDS.steady) zones.steady += seconds
    else if (share < BANDS.hard) zones.hard += seconds
    else zones.peak += seconds
  }

  return {
    easy: Math.round(zones.easy),
    steady: Math.round(zones.steady),
    hard: Math.round(zones.hard),
    peak: Math.round(zones.peak),
  }
}

export const ZONE_ORDER = ['easy', 'steady', 'hard', 'peak'] as const
export type ZoneName = (typeof ZONE_ORDER)[number]

/** Copy keys as a map, for the reason every other key map here is one. */
export const ZONE_KEY = {
  easy: 'activity:zone.easy',
  steady: 'activity:zone.steady',
  hard: 'activity:zone.hard',
  peak: 'activity:zone.peak',
} as const satisfies Record<ZoneName, string>

/**
 * The stored jsonb back to a shape, tolerating anything.
 *
 * `hr_zones` is jsonb, so the database will accept whatever was written and the
 * generated type is `Json`. A row written by an older build — or by hand during
 * development — must render as "no zones" rather than crash the detail screen.
 */
export function parseHrZones(value: unknown): HrZones | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const zones = ZONE_ORDER.map((name) => (typeof raw[name] === 'number' ? raw[name] : 0))
  if (zones.every((seconds) => seconds === 0)) return null
  return { easy: zones[0], steady: zones[1], hard: zones[2], peak: zones[3] }
}
