import { workoutBurn } from '../burn'
import { completeAll, type LiveWorkout, newWorkout } from '../model'
import { receivePulse, watchEnergy } from '../pulse'

const body = { weightKg: 70, restingKcalPerDay: null }

function danced(watch?: LiveWorkout['watch']): LiveWorkout {
  const workout = newWorkout({
    name: 'Dance',
    startedAt: 1_000_000,
    exercises: [
      { exerciseId: 'dance', name: 'Dance', tracking: 'duration', sets: [{ durationS: 3600 }] },
    ],
  })
  return { ...completeAll(workout, 1), watch }
}

describe("a workout's burn", () => {
  it('is our estimate when no watch is recording', () => {
    expect(workoutBurn(danced(), 3600, body, null)).toEqual({ kcal: 280, source: 'estimate' })
  })

  it("is the watch's measurement, never added to the estimate", () => {
    const recorded = danced({ recorded: true, appliedSeq: 1 })
    expect(workoutBurn(recorded, 3600, body, 412.6)).toEqual({ kcal: 413, source: 'watch' })
  })

  it('waits for the watch rather than showing an estimate it will not save', () => {
    const recorded = danced({ recorded: true, appliedSeq: 1 })
    expect(workoutBurn(recorded, 3600, body, null)).toEqual({ kcal: null, source: 'watch' })
  })

  it("keeps an edited workout's measured energy", () => {
    const edited = danced({ recorded: true, appliedSeq: 1, kcal: 300 })
    expect(workoutBurn(edited, 3600, body, null)).toEqual({ kcal: 300, source: 'watch' })
  })

  it('takes a streamed figure before the recording command has landed', () => {
    expect(workoutBurn(danced(), 3600, body, 150).source).toBe('watch')
  })

  it('is nothing yet before any set is done, and unknown without a weight', () => {
    const fresh = newWorkout({
      name: 'Push',
      startedAt: 1_000_000,
      exercises: [{ exerciseId: 'dance', name: 'Dance', tracking: 'duration', sets: [{}] }],
    })
    expect(workoutBurn(fresh, 600, body, null).kcal).toBe(0)
    expect(workoutBurn(danced(), 3600, undefined, null).kcal).toBeNull()
  })
})

describe('what the watch streams', () => {
  // A reading arms a timer for when it goes stale.
  beforeAll(() => jest.useFakeTimers())
  afterAll(() => jest.useRealTimers())

  it('keeps the energy when a reading carries only a heart rate', () => {
    receivePulse({ workoutId: 'w1', bpm: 120, kcal: 88, at: 1 })
    receivePulse({ workoutId: 'w1', bpm: 124, kcal: null, at: 2 })
    expect(watchEnergy('w1')).toBe(88)
    expect(watchEnergy('w2')).toBeNull()
  })
})
