import type { ActivitySession } from '@/data'
import { WORKOUT_KINDS } from '../workoutKind'
import { workoutDetails } from '../workoutMetrics'

const session: ActivitySession = {
  id: 'workout',
  date: '2026-10-03',
  provider: 'apple_health',
  kind: 'run',
  kindLabel: null,
  startedAt: '2026-10-03T06:00:00+08:00',
  endedAt: '2026-10-03T06:32:48+08:00',
  durationS: 1968,
  activeKcal: 384,
  distanceM: 5200,
  avgHr: 148,
  maxHr: 174,
  elevationM: 42,
  hrZones: null,
  sourceName: null,
}

describe('sport-specific workout measurements', () => {
  it.each(WORKOUT_KINDS)('uses meaningful distance for %s', (kind) => {
    const details = workoutDetails({ ...session, kind })
    const travels = ['run', 'walk', 'hike', 'cycle', 'swim', 'rowing'].includes(kind)
    expect(Boolean(details.distance)).toBe(travels)
    expect(Boolean(details.rhythm)).toBe(travels)
    expect(details.tone).toBeTruthy()
  })

  it('uses minutes per kilometre on foot', () => {
    expect(workoutDetails(session).rhythm).toEqual({ value: '6:18', unit: 'paceUnit' })
    expect(workoutDetails(session).distance).toEqual({ value: '5.20', unit: 'km' })
  })

  it('uses speed for a ride and pace per 100 metres for a swim', () => {
    expect(
      workoutDetails({ ...session, kind: 'cycle', distanceM: 28400, durationS: 4320 }).rhythm,
    ).toEqual({ value: '23.7', unit: 'speedUnit' })
    const swim = workoutDetails({ ...session, kind: 'swim', distanceM: 1500, durationS: 2130 })
    expect(swim.rhythm).toEqual({ value: '2:22', unit: 'swimPaceUnit' })
    expect(swim.distance).toEqual({ value: '1,500', unit: 'm' })
  })

  it('uses the rowing split per 500 metres', () => {
    expect(
      workoutDetails({ ...session, kind: 'rowing', distanceM: 5000, durationS: 1275 }).rhythm,
    ).toEqual({ value: '2:08', unit: 'rowPaceUnit' })
  })

  it.each([null, 0])('does not derive rhythm from absent or zero distance (%s)', (distanceM) => {
    for (const kind of ['run', 'cycle', 'swim', 'rowing']) {
      const details = workoutDetails({ ...session, kind, distanceM })
      expect(details.distance).toBeNull()
      expect(details.rhythm).toBeNull()
    }
  })

  it('does not turn tiny recordings into confident speed or pace', () => {
    for (const kind of ['run', 'cycle', 'swim', 'rowing']) {
      expect(workoutDetails({ ...session, kind, distanceM: 50 }).rhythm).toBeNull()
      expect(workoutDetails({ ...session, kind, durationS: 10 }).rhythm).toBeNull()
    }
  })

  it('rounds seconds across minute boundaries without displaying :60', () => {
    expect(
      workoutDetails({ ...session, kind: 'swim', distanceM: 1000, durationS: 1196 }).rhythm,
    ).toEqual({ value: '2:00', unit: 'swimPaceUnit' })
  })

  it('keeps an unknown sport drawable without deriving a travel statistic', () => {
    const details = workoutDetails({ ...session, kind: 'new-provider-sport' })
    expect(details.kind).toBe('other')
    expect(details.distance).toBeNull()
    expect(details.rhythm).toBeNull()
  })
})
