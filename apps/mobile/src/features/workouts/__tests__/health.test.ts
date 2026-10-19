import { Platform } from 'react-native'

import {
  deleteWorkoutFromHealth,
  requestWorkoutWrite,
  saveWorkoutToHealth,
  workoutWriteStatus,
} from '@/lib/health'
import { syncWorkoutToHealth } from '../health'
import { newWorkout } from '../model'
import { getWorkoutPrefs, setWorkoutPrefs } from '../prefs'
import { receivePulse } from '../pulse'

jest.mock('@/lib/health', () => ({
  deleteWorkoutFromHealth: jest.fn(),
  requestWorkoutWrite: jest.fn(),
  saveWorkoutToHealth: jest.fn(),
  workoutWriteStatus: jest.fn(),
}))

jest.mock('../prefs', () => ({
  getWorkoutPrefs: jest.fn(),
  setWorkoutPrefs: jest.fn(),
}))

const workout = newWorkout({ name: 'Training', startedAt: 1_000_000 })

describe('saving a workout to Apple Health', () => {
  let warn: jest.SpyInstance

  beforeEach(() => {
    jest.resetAllMocks()
    jest.replaceProperty(Platform, 'OS', 'ios')
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest
      .mocked(getWorkoutPrefs)
      .mockReturnValue({ keepAwake: true, healthWrite: true, bodyFiguresOpen: false })
    jest.mocked(workoutWriteStatus).mockReturnValue('unasked')
    jest.mocked(deleteWorkoutFromHealth).mockResolvedValue(undefined)
    jest.mocked(saveWorkoutToHealth).mockResolvedValue('health-workout')
  })

  afterEach(() => jest.restoreAllMocks())

  it('asks on the first save and writes the workout after permission is granted', async () => {
    jest.mocked(requestWorkoutWrite).mockResolvedValue(true)

    await expect(syncWorkoutToHealth(workout, 2_000_000, 100)).resolves.toEqual({
      healthId: 'health-workout',
      failed: false,
      replaced: true,
    })
    expect(requestWorkoutWrite).toHaveBeenCalledTimes(1)
    expect(saveWorkoutToHealth).toHaveBeenCalledWith(
      expect.objectContaining({ id: workout.id, kcal: 100 }),
    )
    expect(setWorkoutPrefs).not.toHaveBeenCalled()
  })

  it('turns saving off quietly after a recorded refusal on the first sheet', async () => {
    jest.mocked(requestWorkoutWrite).mockResolvedValue(false)
    jest.mocked(workoutWriteStatus).mockReturnValueOnce('unasked').mockReturnValue('refused')

    await expect(syncWorkoutToHealth(workout, 2_000_000, 100)).resolves.toEqual({
      healthId: null,
      failed: false,
      replaced: false,
    })
    expect(setWorkoutPrefs).toHaveBeenCalledWith({ healthWrite: false })
    expect(deleteWorkoutFromHealth).not.toHaveBeenCalled()
    expect(saveWorkoutToHealth).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps saving enabled and can retry when the first request did not complete', async () => {
    jest.mocked(requestWorkoutWrite).mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    await expect(syncWorkoutToHealth(workout, 2_000_000, 100)).resolves.toEqual({
      healthId: null,
      failed: true,
      replaced: false,
    })
    expect(setWorkoutPrefs).not.toHaveBeenCalled()
    expect(deleteWorkoutFromHealth).not.toHaveBeenCalled()
    expect(saveWorkoutToHealth).not.toHaveBeenCalled()

    await expect(syncWorkoutToHealth(workout, 2_000_000, 100)).resolves.toMatchObject({
      healthId: 'health-workout',
      failed: false,
    })
    expect(requestWorkoutWrite).toHaveBeenCalledTimes(2)
  })

  it('preserves the old copy and reports a permission error without throwing', async () => {
    jest.mocked(requestWorkoutWrite).mockRejectedValue(new Error('Authorization failed'))

    await expect(
      syncWorkoutToHealth({ ...workout, healthWorkoutId: 'old-copy' }, 2_000_000, 100),
    ).resolves.toEqual({ healthId: 'old-copy', failed: true, replaced: false })
    expect(setWorkoutPrefs).not.toHaveBeenCalled()
    expect(deleteWorkoutFromHealth).not.toHaveBeenCalled()
    expect(saveWorkoutToHealth).not.toHaveBeenCalled()
  })

  it('still reports a failure when previously granted permission has been revoked', async () => {
    jest.mocked(workoutWriteStatus).mockReturnValue('refused')
    jest.mocked(deleteWorkoutFromHealth).mockRejectedValue(new Error('Not authorized'))

    await expect(syncWorkoutToHealth(workout, 2_000_000, 100)).resolves.toMatchObject({
      failed: true,
      replaced: false,
    })
    expect(requestWorkoutWrite).not.toHaveBeenCalled()
    expect(setWorkoutPrefs).not.toHaveBeenCalled()
    expect(saveWorkoutToHealth).not.toHaveBeenCalled()
  })

  it('writes no copy of its own once the watch has streamed energy for the workout', async () => {
    // Before its `recording` command lands: the watch saves its own copy, and a
    // second from here would put the session's energy in Health twice.
    jest.useFakeTimers()
    receivePulse({ workoutId: workout.id, bpm: null, kcal: 50, at: 1 })

    await expect(syncWorkoutToHealth(workout, 2_000_000, 50)).resolves.toMatchObject({
      replaced: false,
    })
    expect(saveWorkoutToHealth).not.toHaveBeenCalled()
    expect(deleteWorkoutFromHealth).not.toHaveBeenCalled()
    jest.useRealTimers()
  })

  it('skips the permission sheet when saving was turned off', async () => {
    jest
      .mocked(getWorkoutPrefs)
      .mockReturnValue({ keepAwake: true, healthWrite: false, bodyFiguresOpen: false })

    await expect(syncWorkoutToHealth(workout, 2_000_000, 100)).resolves.toMatchObject({
      failed: false,
      replaced: false,
    })
    expect(workoutWriteStatus).not.toHaveBeenCalled()
    expect(requestWorkoutWrite).not.toHaveBeenCalled()
  })
})
