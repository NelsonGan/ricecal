import type { WatchPulse } from '@modules/ricecal-watch'

let emit: (payload: Record<string, unknown>) => void = () => {}
jest.mock('expo', () => ({
  requireOptionalNativeModule: () => ({
    addListener: (_event: string, listener: (payload: Record<string, unknown>) => void) => {
      emit = listener
      return { remove: () => {} }
    },
  }),
}))

const { addWatchPulseListener } =
  require('@modules/ricecal-watch') as typeof import('@modules/ricecal-watch')

describe('a reading from the watch', () => {
  const heard: WatchPulse[] = []
  beforeAll(() => addWatchPulseListener((pulse) => heard.push(pulse)))
  beforeEach(() => {
    heard.length = 0
  })

  it('carries the energy beside the heart rate', () => {
    emit({ workoutId: 'w1', bpm: 120, kcal: 42.5, at: 1 })
    expect(heard).toEqual([{ workoutId: 'w1', bpm: 120, kcal: 42.5, at: 1 }])
  })

  it('takes energy alone, measured with heart rate refused', () => {
    emit({ workoutId: 'w1', kcal: 10, at: 2 })
    expect(heard).toEqual([{ workoutId: 'w1', bpm: null, kcal: 10, at: 2 }])
  })

  it('takes a heart rate alone, from a watch that does not send energy', () => {
    emit({ workoutId: 'w1', bpm: 99, at: 3 })
    expect(heard).toEqual([{ workoutId: 'w1', bpm: 99, kcal: null, at: 3 }])
  })

  it('drops a reading with neither, or with no workout', () => {
    emit({ workoutId: 'w1', at: 4 })
    emit({ bpm: 120, kcal: 5, at: 5 })
    emit({ workoutId: 'w1', kcal: -3, at: 6 })
    expect(heard).toEqual([])
  })
})
