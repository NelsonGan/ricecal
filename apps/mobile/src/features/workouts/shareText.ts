import { format, parseISO } from 'date-fns'
import type { TFunction } from 'i18next'

import type { WorkoutDetail } from '@/data'
import { datePattern } from '@/lib/dates'
import { UNIT_KEY, type WeightUnit } from '@/lib/units'
import { setBadges } from './copy'
import { type DistanceUnit, durationText, volumeText } from './format'
import { showsVolume } from './model'
import { describeSet } from './SetTable'

/**
 * A finished workout as plain text, for the share sheet: what a gym chat or a
 * coach wants to read, which is the session's size and then every set. Text
 * rather than a picture, because the sets are what gets read and a picture of
 * a long session is a picture nobody can zoom.
 *
 *   Push day
 *   Thu 15 Oct · 1 h 2 min · 2,100 kg
 *
 *   Bench Press (Barbell)
 *   1  60 kg × 8
 *   W  40 kg × 10
 */
export function workoutShareText(
  t: TFunction<['workouts', 'common']>,
  workout: WorkoutDetail,
  unit: WeightUnit,
  distanceUnit: DistanceUnit,
): string {
  const unitLabel = t(UNIT_KEY[unit])
  const summary = [
    format(parseISO(workout.startedAt), datePattern('weekdayDayMonth')),
    durationText(t, workout.durationS),
    showsVolume(workout.entries.map((entry) => entry.tracking))
      ? volumeText(t, workout.volumeKg, unit)
      : null,
  ].filter(Boolean)
  const blocks = workout.entries.map((entry) => {
    const badges = setBadges(entry.sets, t)
    const lines = entry.sets.map((set, index) => {
      const label = badges[index].label
      const figures = describeSet(set, entry.tracking, unit, distanceUnit, unitLabel)
      const rpe = set.rpe !== null ? ` @${set.rpe}` : ''
      return `${label}  ${figures}${rpe}`
    })
    return [entry.name, ...lines].join('\n')
  })
  return [[workout.name, summary.join(' · ')].join('\n'), ...blocks].join('\n\n')
}
