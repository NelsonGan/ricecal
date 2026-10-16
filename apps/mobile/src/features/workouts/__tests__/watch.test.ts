import type { WatchCommand } from '@modules/ricecal-watch'
import type { Routine } from '@/data'
import { heartReplyIsFinal } from '@/data/workout-heart'
import { apply, type LiveWorkout, newWorkout, toPayload } from '../model'
import { applyWatchCommand, watchRoutines, watchWorkout } from '../watch'

const NOW = Date.UTC(2026, 9, 16, 10, 30)

const bench = {
  exerciseId: 'barbell-bench-press',
  name: 'Bench Press (Barbell)',
  tracking: 'weight_reps' as const,
  restS: 120,
  sets: [{ weightKg: 60, reps: 8 }, {}],
}

function workout(): LiveWorkout {
  return newWorkout({ id: 'w1', name: 'Push', startedAt: NOW - 600_000, exercises: [bench] })
}

/** Applies a command the way `WatchSync` does, returning the workout after it. */
function run(current: LiveWorkout | null, command: WatchCommand, now = NOW): LiveWorkout | null {
  const outcome = applyWatchCommand(current, command, { now, ended: [] })
  if (outcome.kind === 'start') return outcome.workout
  if (outcome.kind === 'actions' && current) return outcome.actions.reduce(apply, current)
  return current
}

describe('the state the watch is sent', () => {
  it('shows what an empty set offers, and the rest that completing it starts', () => {
    const live = workout()
    const state = watchWorkout(
      live,
      {
        'barbell-bench-press': [
          { kind: 'normal', weightKg: 55, reps: 10, durationS: null, distanceM: null },
        ],
      },
      90,
    )
    const [first, second] = state.exercises[0].sets
    expect(first).toMatchObject({ weightKg: 60, reps: 8, done: false, restS: 120 })
    // The set above was typed, so the second set is offered it.
    expect(second).toMatchObject({ weightKg: 60, reps: 8, done: false })
    // Only the figures the tracking records.
    expect(first.durationS).toBeNull()
  })

  it('names no rest between the members of a superset round', () => {
    const live = newWorkout({
      name: 'Pair',
      exercises: [
        { ...bench, superset: 1, restS: null },
        {
          exerciseId: 'pull-up',
          name: 'Pull Up',
          tracking: 'reps',
          superset: 1,
          sets: [{ reps: 8 }],
        },
      ],
    })
    const state = watchWorkout(live, undefined, 90)
    expect(state.exercises[0].sets[0].restS).toBe(0)
    expect(state.exercises[1].sets[0].restS).toBe(90)
  })

  it('keeps a routine the same until the routine changes', () => {
    const routine: Routine = {
      id: 'r1',
      name: 'Push day',
      notes: null,
      templateId: null,
      position: 0,
      lastUsedAt: null,
      exercises: [
        {
          exercise_id: 'barbell-bench-press',
          exercise_name: 'Bench Press (Barbell)',
          tracking: 'weight_reps',
          sets: [{ reps: 5 }],
        },
      ],
    }
    const once = watchRoutines([routine], undefined, 90)
    expect(watchRoutines([routine], undefined, 90)).toEqual(once)
    expect(once[0].exercises[0].sets[0].plan).toEqual({
      weightKg: null,
      reps: 5,
      durationS: null,
      distanceM: null,
    })
  })
})

describe("the watch's commands", () => {
  it('completes a set with the figures shown, and starts its rest', () => {
    const live = workout()
    const set = live.exercises[0].sets[1]
    const after = run(live, {
      id: 'c1',
      workoutId: 'w1',
      at: NOW - 1000,
      type: 'complete',
      exerciseKey: live.exercises[0].key,
      setId: set.id,
      weightKg: 62.5,
      reps: 6,
      durationS: null,
      distanceM: null,
      restS: 120,
    })
    expect(after?.exercises[0].sets[1]).toMatchObject({
      done: true,
      doneAt: NOW - 1000,
      weightKg: 62.5,
      reps: 6,
    })
    expect(after?.rest).toEqual({
      endsAt: NOW - 1000 + 120_000,
      totalS: 120,
      exerciseKey: live.exercises[0].key,
    })
    expect(after?.watch?.applied).toEqual(['c1'])
  })

  it('rewrites a typed figure the watch changed', () => {
    const live = workout()
    const set = live.exercises[0].sets[0]
    const after = run(live, {
      id: 'c1',
      workoutId: 'w1',
      at: NOW,
      type: 'complete',
      exerciseKey: live.exercises[0].key,
      setId: set.id,
      weightKg: 65,
      reps: 8,
      durationS: null,
      distanceM: null,
      restS: 0,
    })
    expect(after?.exercises[0].sets[0]).toMatchObject({ done: true, weightKg: 65, reps: 8 })
    expect(after?.rest).toBeNull()
  })

  it('applies a command once however often it arrives', () => {
    const live = workout()
    const command: WatchCommand = {
      id: 'add',
      workoutId: 'w1',
      at: NOW,
      type: 'addSet',
      exerciseKey: live.exercises[0].key,
      setId: 'watch-set',
    }
    const once = run(live, command)
    const twice = run(once, command)
    expect(twice?.exercises[0].sets.map((set) => set.id)).toEqual([
      ...live.exercises[0].sets.map((set) => set.id),
      'watch-set',
    ])
  })

  it('refuses a set with nothing in it', () => {
    const live = newWorkout({ id: 'w1', name: 'Push', exercises: [{ ...bench, sets: [{}] }] })
    const after = run(live, {
      id: 'c1',
      workoutId: 'w1',
      at: NOW,
      type: 'complete',
      exerciseKey: live.exercises[0].key,
      setId: live.exercises[0].sets[0].id,
      weightKg: null,
      reps: null,
      durationS: null,
      distanceM: null,
      restS: 90,
    })
    expect(after?.exercises[0].sets[0].done).toBe(false)
    expect(after?.watch?.applied).toEqual(['c1'])
  })

  it('starts a workout under the watch’s own ids', () => {
    const started = run(null, {
      id: 's1',
      workoutId: 'w9',
      at: NOW + 5000,
      type: 'start',
      routineId: 'r1',
      name: 'Push day',
      exercises: [
        {
          key: 'k1',
          exerciseId: 'barbell-bench-press',
          name: 'Bench Press (Barbell)',
          tracking: 'weight_reps',
          restS: null,
          superset: null,
          sets: [
            {
              id: 's-a',
              kind: 'normal',
              weightKg: null,
              reps: 5,
              durationS: null,
              distanceM: null,
            },
          ],
        },
      ],
    })
    expect(started).toMatchObject({ id: 'w9', routineId: 'r1', startedAt: NOW })
    expect(started?.exercises[0]).toMatchObject({ key: 'k1', sets: [{ id: 's-a', reps: 5 }] })
    expect(started?.watch).toEqual({ recorded: false, applied: ['s1'] })
  })

  it('does not replace a workout already running, nor bring back one that ended', () => {
    const live = workout()
    const start: WatchCommand = {
      id: 's1',
      workoutId: 'w2',
      at: NOW,
      type: 'start',
      routineId: null,
      name: 'Pull',
      exercises: [],
    }
    expect(applyWatchCommand(live, start, { now: NOW, ended: [] })).toEqual({ kind: 'ignore' })
    expect(
      applyWatchCommand(null, start, { now: NOW, ended: [{ id: 'w2', saved: true, at: NOW }] }),
    ).toEqual({ kind: 'ignore' })
  })

  it('ignores a command for another workout', () => {
    expect(
      applyWatchCommand(
        workout(),
        { id: 'x', workoutId: 'other', at: NOW, type: 'restSkip' },
        {
          now: NOW,
          ended: [],
        },
      ),
    ).toEqual({ kind: 'ignore' })
  })

  it('marks the workout as recorded, which keeps the phone from saving its own Health copy', () => {
    const after = run(workout(), { id: 'r', workoutId: 'w1', at: NOW, type: 'recording' })
    expect(after?.watch?.recorded).toBe(true)
    // The flag is the phone's own and never reaches the server.
    expect(
      after && Object.keys(toPayload(after, NOW, { kcal: null, healthWorkoutId: null })),
    ).not.toContain('watch')
  })

  it('finishes no earlier than the start and no later than now', () => {
    const live = workout()
    expect(
      applyWatchCommand(
        live,
        { id: 'f', workoutId: 'w1', at: NOW, type: 'finish', endedAt: NOW + 60_000 },
        {
          now: NOW,
          ended: [],
        },
      ),
    ).toEqual({ kind: 'finish', endedAt: NOW })
  })
})

describe('a heart rate trace waiting for its workout', () => {
  const waiting = { trace: {} as never, receivedAt: NOW }

  it('waits while the workout is missing, for a week', () => {
    expect(heartReplyIsFinal({ data: 'missing', error: null }, waiting, NOW + 1000)).toBe('wait')
    expect(heartReplyIsFinal({ data: 'missing', error: null }, waiting, NOW + 8 * 86_400_000)).toBe(
      'done',
    )
  })

  it('stops on a failure a retry can fix, and gives up on a refusal', () => {
    expect(heartReplyIsFinal({ data: null, error: { code: 'PGRST301' } }, waiting)).toBe('stop')
    expect(heartReplyIsFinal({ data: null, error: { code: '22003' } }, waiting)).toBe('done')
    expect(heartReplyIsFinal({ data: 'saved', error: null }, waiting)).toBe('done')
  })
})
