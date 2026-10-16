import { EXERCISES, exerciseById } from '../catalogue'
import { buildImport, categoryFor, equipmentFor, importedWorkoutId } from '../import/build'
import { parseCsv } from '../import/csv'
import { type Logged, matchLogged } from '../import/existing'
import { matchExercise } from '../import/match'
import { HEVY_NAMES, STRONG_NAMES } from '../import/names'
import { type ParsedExport, parseExport } from '../import/parse'

/**
 * Importing a Strong or Hevy history. The rows below are written in each
 * app's real export format (header, quoting, date shapes, the rest-timer rows
 * Strong puts between sets) with made-up workouts.
 */

const STRONG_HEADER =
  'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE'

const STRONG = [
  STRONG_HEADER,
  '2025-07-09 11:13:00,"Push, heavy",1h 5m,"Bench Press (Barbell)",W,20.0,10.0,0,0.0,"","Felt ""strong""",',
  '2025-07-09 11:13:00,"Push, heavy",1h 5m,"Bench Press (Barbell)",Rest Timer,0,0.0,0,120.0,,,',
  '2025-07-09 11:13:00,"Push, heavy",1h 5m,"Bench Press (Barbell)",1,60.0,8.0,0,0.0,"Paused, first rep","Felt ""strong""",8',
  '2025-07-09 11:13:00,"Push, heavy",1h 5m,"Bench Press (Barbell)",Rest Timer,0,0.0,0,120.0,,,',
  '2025-07-09 11:13:00,"Push, heavy",1h 5m,"Bench Press (Barbell)",2,57.5,8.0,0,0.0,"","",',
  '2025-07-09 11:13:00,"Push, heavy",1h 5m,"Bench Press (Barbell)",Rest Timer,0,0.0,0,90.0,,,',
  '2025-07-09 11:13:00,"Push, heavy",1h 5m,"Bench Press (Barbell)",D,40.0,12.0,0,0.0,"","",',
  '2025-07-09 11:13:00,"Push, heavy",1h 5m,"Chest Fly",1,30.0,12.0,0,0.0,"","",',
  '2025-07-09 11:13:00,"Push, heavy",1h 5m,"Plank",1,0,0.0,0,45.0,"","",',
  '2025-07-09 11:13:00,"Push, heavy",1h 5m,"Sit Up",1,5.0,10.0,0,0.0,"","",',
  '2025-07-09 11:13:00,"Push, heavy",1h 5m,"Zottman Curl",1,12.0,10.0,0,0.0,"","",',
  '2025-07-09 18:40:00,"Run",32m,"Running (Treadmill)",1,0,0.0,5.0,1800.0,"","",',
  '2025-07-09 18:40:00,"Run",32m,"Empty Thing",1,0,0.0,0,0.0,"","",',
].join('\r\n')

const HEVY_HEADER =
  '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_lbs","reps","distance_miles","duration_seconds","rpe"'

const HEVY = [
  HEVY_HEADER,
  '"Arms","3 févr. 2026, 18:00","3 févr. 2026, 19:10","Quick one","Hack Squat",,"",0,"warmup",95,8,,,',
  '"Arms","3 févr. 2026, 18:00","3 févr. 2026, 19:10","Quick one","Bicep Curl (Dumbbell)",0,"",0,"normal",25,12,,,',
  '"Arms","3 févr. 2026, 18:00","3 févr. 2026, 19:10","Quick one","Triceps Rope Pushdown",0,"",0,"normal",50,12,,,',
  '"Arms","3 févr. 2026, 18:00","3 févr. 2026, 19:10","Quick one","Bicep Curl (Dumbbell)",0,"",1,"failure",25,10,,,9.5',
  '"Arms","3 févr. 2026, 18:00","3 févr. 2026, 19:10","Quick one","Triceps Rope Pushdown",0,"",1,"dropset",40,15,,,',
  '"Arms","3 févr. 2026, 18:00","3 févr. 2026, 19:10","Quick one","Treadmill",,"Easy pace",0,"normal",,,2,1200,',
  '"Legs","14 Oct 2026, 17:14","14 Oct 2026, 18:10","","Seated Cable Row - V Grip (Cable)",,"",0,"normal",100,10,,,',
].join('\n')

const units = { weight: 'kg', distance: 'km' } as const
const fallback = () => 'Workout'
const OWNER = '11111111-0000-4000-8000-000000000001'

function parsed(text: string): ParsedExport {
  const result = parseExport(text)
  if ('error' in result) throw new Error(result.error)
  return result
}

describe('parseCsv', () => {
  it('reads quotes, doubled quotes, commas and line breaks inside quotes, a BOM and CRLF', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"\nthere'],
    ])
  })

  it('takes semicolons as the separator when the header uses them', () => {
    expect(parseCsv('Date;Weight\n2026-01-01;62,5')).toEqual([
      ['Date', 'Weight'],
      ['2026-01-01', '62,5'],
    ])
  })
})

describe('a Strong export', () => {
  const file = parsed(STRONG)

  it('is recognised, and its rest-timer rows are not sets', () => {
    expect(file.source).toBe('strong')
    expect(file.workouts).toHaveLength(2)
    expect(file.rows).toBe(10)
    const bench = file.workouts[0].exercises[0]
    expect(bench.sets.map((set) => set.kind)).toEqual(['warmup', 'normal', 'normal', 'drop'])
    expect(bench.rests).toEqual([120, 120, 90])
  })

  it('keeps two workouts on one day apart, earliest first', () => {
    expect(file.workouts.map((workout) => workout.name)).toEqual(['Push, heavy', 'Run'])
    expect(file.workouts[0].durationS).toBe(65 * 60)
    expect(file.workouts[1].durationS).toBe(32 * 60)
  })

  it('says the weights carry no unit, because Strong does not write one', () => {
    expect(file.unitless).toEqual({ weight: true, distance: true })
  })

  it('builds documents in kilograms, with the rest Strong timed most and both notes', () => {
    const plan = buildImport(file, units, fallback, OWNER)
    const [push, run] = plan.workouts.map((planned) => planned.document)
    expect(push.name).toBe('Push, heavy')
    expect(push.notes).toBe('Felt "strong"')
    expect(push.log_date).toBe('2025-07-09')
    expect(new Date(push.started_at).getHours()).toBe(11)
    expect(new Date(push.ended_at).getTime() - new Date(push.started_at).getTime()).toBe(
      65 * 60_000,
    )
    const bench = push.exercises[0]
    expect(bench).toMatchObject({
      exercise_id: 'barbell-bench-press',
      tracking: 'weight_reps',
      rest_s: 120,
      notes: 'Paused, first rep',
    })
    expect(bench.sets[1]).toEqual({
      kind: 'normal',
      weight_kg: 60,
      reps: 8,
      duration_s: null,
      distance_m: null,
      rpe: 8,
    })
    expect(run.exercises.map((exercise) => exercise.exercise_id)).toEqual(['treadmill'])
    expect(run.exercises[0].sets[0]).toMatchObject({ distance_m: 5000, duration_s: 1800 })
  })

  it('reads pounds and miles when the person says so', () => {
    const plan = buildImport(file, { weight: 'lb', distance: 'mi' }, fallback, OWNER)
    expect(plan.workouts[0].document.exercises[0].sets[1].weight_kg).toBe(27.22)
    expect(plan.workouts[1].document.exercises[0].sets[0].distance_m).toBe(8046.7)
  })

  it("files Strong's own names by the table: Chest Fly is the machine", () => {
    const plan = buildImport(file, units, fallback, OWNER)
    const ids = plan.workouts[0].document.exercises.map((exercise) => exercise.exercise_id)
    expect(ids).toEqual(['barbell-bench-press', 'pec-deck', 'plank', 'sit-up', ''])
  })

  it('gives a timed hold its seconds, and a sit-up done holding a plate its weight', () => {
    const exercises = buildImport(file, units, fallback, OWNER).workouts[0].document.exercises
    expect(exercises[2]).toMatchObject({ tracking: 'duration', sets: [{ duration_s: 45 }] })
    expect(exercises[3]).toMatchObject({
      tracking: 'weighted_reps',
      sets: [{ weight_kg: 5, reps: 10 }],
    })
  })

  it('makes a name the catalogue lacks into a custom exercise, and drops an empty set', () => {
    const plan = buildImport(file, units, fallback, OWNER)
    expect(plan.customs).toEqual([
      { name: 'Zottman Curl', tracking: 'weight_reps', equipment: 'other', category: 'arms' },
    ])
    expect(plan.workouts[0].customNames).toEqual([null, null, null, null, 'Zottman Curl'])
    expect(plan.workouts[1].document.exercises).toHaveLength(1)
    expect(plan.skipped).toBe(1)
  })
})

describe('a Hevy export', () => {
  const file = parsed(HEVY)

  it('reads a date written in French, and the end time as the duration', () => {
    expect(file.source).toBe('hevy')
    const [arms] = file.workouts
    expect(arms.start).toMatchObject({ year: 2026, month: 2, day: 3, hour: 18 })
    expect(arms.durationS).toBe(70 * 60)
    expect(file.unitless).toEqual({ weight: false, distance: false })
  })

  it('keeps a superset together and numbers it from 0', () => {
    const [arms] = buildImport(file, units, fallback, OWNER).workouts.map(
      (planned) => planned.document,
    )
    expect(arms.exercises.map((exercise) => [exercise.exercise_id, exercise.superset])).toEqual([
      ['barbell-hack-squat', null],
      ['dumbbell-curl', 0],
      ['triceps-rope-pushdown', 0],
      ['treadmill', null],
    ])
  })

  it("reads Hevy's set types, pounds and miles from its own columns", () => {
    const [arms] = buildImport(file, units, fallback, OWNER).workouts.map(
      (planned) => planned.document,
    )
    expect(arms.exercises[0].sets[0]).toMatchObject({ kind: 'warmup', weight_kg: 43.09 })
    expect(arms.exercises[1].sets[1]).toMatchObject({ kind: 'failure', rpe: 9.5 })
    expect(arms.exercises[2].sets[1]).toMatchObject({ kind: 'drop' })
    expect(arms.exercises[3]).toMatchObject({ notes: 'Easy pace' })
    expect(arms.exercises[3].sets[0]).toMatchObject({ distance_m: 3218.7, duration_s: 1200 })
  })

  it('files the V-grip cable row under the seated cable row', () => {
    const legs = buildImport(file, units, fallback, OWNER).workouts[1].document
    expect(legs.exercises[0].exercise_id).toBe('seated-cable-row')
  })
})

describe('reading a file that is neither', () => {
  it('says it does not know the format', () => {
    expect(parseExport('Date,Food,Calories\n2026-01-01,Rice,200')).toEqual({ error: 'unknown' })
    expect(parseExport('')).toEqual({ error: 'empty' })
  })
})

describe('the name tables', () => {
  it('point only at exercises that exist', () => {
    for (const id of [...Object.values(STRONG_NAMES), ...Object.values(HEVY_NAMES)]) {
      if (id !== null) expect(exerciseById(id)).toBeDefined()
    }
  })

  it("cover all of Strong's 253 built-in names and Hevy's 430 titles", () => {
    expect(Object.keys(STRONG_NAMES)).toHaveLength(253)
    expect(Object.keys(HEVY_NAMES)).toHaveLength(430)
  })

  it('map every built-in Strong exercise, except its sports and one name that says no lift', () => {
    const unmapped = Object.entries(STRONG_NAMES)
      .filter(([, id]) => id === null)
      .map(([name]) => name)
    expect(unmapped.sort()).toEqual([
      'Climbing',
      'Skating',
      'Skiing',
      'Snowboarding',
      'Triceps Extension',
    ])
  })

  it("leave only the app's own entries without a name in either app", () => {
    // Every other catalogue exercise is one Strong or Hevy ships, so a history
    // from either reaches it by name; these six are RiceCal's additions.
    const named = new Set([...Object.values(STRONG_NAMES), ...Object.values(HEVY_NAMES)])
    expect(EXERCISES.filter((exercise) => !named.has(exercise.id)).map((e) => e.id)).toEqual([
      'hollow-hold',
      'bear-crawl',
      'zumba',
      'dance',
      'foam-rolling',
      'tai-chi',
    ])
  })
})

describe('matchExercise', () => {
  it('reads the same name differently for each app where they disagree', () => {
    expect(matchExercise('Hack Squat', 'strong')?.id).toBe('hack-squat')
    expect(matchExercise('Hack Squat', 'hevy')?.id).toBe('barbell-hack-squat')
  })

  it('matches a made-up name only when it is a catalogue name in another order', () => {
    expect(matchExercise('Barbell Bench Press', 'strong')?.id).toBe('barbell-bench-press')
    expect(matchExercise('bench press barbell', 'hevy')?.id).toBe('barbell-bench-press')
    expect(matchExercise('Bench Press', 'strong')).toBeNull()
  })

  it('never fuzzy-matches a Hevy title it deliberately leaves custom', () => {
    expect(matchExercise('Reverse Lunge (Dumbbell)', 'hevy')).toBeNull()
    expect(matchExercise('Single Leg Press (Machine)', 'hevy')).toBeNull()
  })
})

describe('importedWorkoutId', () => {
  it('is the same for the same workout, different for another, and a valid UUID', () => {
    const id = importedWorkoutId(OWNER, 'strong', '2025-7-9 11:13:0|Push')
    expect(importedWorkoutId(OWNER, 'strong', '2025-7-9 11:13:0|Push')).toBe(id)
    expect(importedWorkoutId(OWNER, 'hevy', '2025-7-9 11:13:0|Push')).not.toBe(id)
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('differs between accounts, since a workout id is unique across all of them', () => {
    const other = '22222222-0000-4000-8000-000000000002'
    expect(importedWorkoutId(other, 'hevy', '2026-10-14 18:0:0|Morning Workout')).not.toBe(
      importedWorkoutId(OWNER, 'hevy', '2026-10-14 18:0:0|Morning Workout'),
    )
  })
})

describe('a custom exercise from its name', () => {
  it('takes the equipment from the brackets and the category from the movement', () => {
    expect(equipmentFor('Spider Curl (Barbell)')).toBe('barbell')
    expect(equipmentFor('Shrug (Cable)')).toBe('cable')
    expect(categoryFor('Standing Leg Curls', 'weight_reps')).toBe('legs')
    expect(categoryFor('Chest Supported T Row', 'weight_reps')).toBe('back')
    expect(categoryFor('Boxing', 'duration')).toBe('fullBody')
  })
})

const hevyRow = (
  title: string,
  start: string,
  end: string,
  exercise: string,
  extra = ',,"",0,"normal",50,10,,,',
) => `"${title}","${start}","${end}","","${exercise}"${extra}`

describe('fixes from the review', () => {
  it('keeps a second block of the same exercise as its own entry, in order', () => {
    const file = parsed(
      [
        HEVY_HEADER,
        hevyRow('Mixed', '14 Oct 2026, 17:00', '14 Oct 2026, 18:00', 'Bench Press (Barbell)'),
        hevyRow('Mixed', '14 Oct 2026, 17:00', '14 Oct 2026, 18:00', 'Squat (Barbell)'),
        hevyRow('Mixed', '14 Oct 2026, 17:00', '14 Oct 2026, 18:00', 'Bench Press (Barbell)'),
      ].join('\n'),
    )
    expect(file.workouts[0].exercises.map((exercise) => exercise.name)).toEqual([
      'Bench Press (Barbell)',
      'Squat (Barbell)',
      'Bench Press (Barbell)',
    ])
  })

  it.each([
    ['14 окт. 2026, 17:14', 10, 17],
    ['14 maj 2026, 17:14', 5, 17],
    ['14 paź 2026, 17:14', 10, 17],
    ['14 Ağu 2026, 17:14', 8, 17],
    ['Oct 14, 2026, 5:14 PM', 10, 17],
    ['Oct 14, 2026, 12:05 AM', 10, 0],
    ['2026年10月14日 17:14', 10, 17],
    ['14 10月 2026, 17:14', 10, 17],
  ])('reads a Hevy date written as %s', (date, month, hour) => {
    const file = parsed([HEVY_HEADER, hevyRow('Day', date, date, 'Plank')].join('\n'))
    expect(file.workouts[0].start).toMatchObject({ year: 2026, month, day: 14, hour })
  })

  it('reads a newer Strong export: semicolons, named units, the duration in seconds', () => {
    const file = parsed(
      [
        'Workout #;Date;Workout Name;Duration (sec);Exercise Name;Set Order;Weight (kg);Reps;Distance (meters);Seconds;Notes;Workout Notes;RPE',
        '1;2026-10-05 07:00:00;Run;1800;Running (Treadmill);1;0;0;5000;1800;;;',
        '1;2026-10-05 07:00:00;Run;1800;Bench Press (Barbell);1;62,5;5;0;0;;;',
      ].join('\n'),
    )
    expect(file.unitless).toEqual({ weight: false, distance: false })
    const [run] = buildImport(file, { weight: 'lb', distance: 'mi' }, fallback, OWNER).workouts
    expect(run.document.exercises[0].sets[0]).toMatchObject({ distance_m: 5000, duration_s: 1800 })
    expect(run.document.exercises[1].sets[0]).toMatchObject({ weight_kg: 62.5, reps: 5 })
    expect(Date.parse(run.document.ended_at) - Date.parse(run.document.started_at)).toBe(1_800_000)
  })

  it('keeps a workout inside the database limits: 60 exercises, 99 sets, 24 hours', () => {
    const rows = [STRONG_HEADER]
    for (let exercise = 0; exercise < 61; exercise++) {
      rows.push(`2026-01-02 10:00:00,"Long",30h,"Thing ${exercise}",1,10,10,0,0,"","",`)
    }
    for (let set = 0; set < 100; set++) {
      rows.push(`2026-01-03 10:00:00,"Sets",1h,"Bench Press (Barbell)",${set + 1},60,5,0,0,"","",`)
    }
    const plan = buildImport(parsed(rows.join('\n')), units, fallback, OWNER)
    const [long, many] = plan.workouts.map((planned) => planned.document)
    expect(long.exercises).toHaveLength(60)
    expect(Date.parse(long.ended_at) - Date.parse(long.started_at)).toBe(24 * 3_600_000)
    expect(many.exercises[0].sets).toHaveLength(99)
    expect(plan.customs).toHaveLength(60)
    expect(plan.skipped).toBe(2)
  })

  it('dissolves a superset left with one member', () => {
    const file = parsed(
      [
        HEVY_HEADER,
        hevyRow(
          'S',
          '14 Oct 2026, 17:00',
          '14 Oct 2026, 18:00',
          'Lateral Raise (Dumbbell)',
          ',0,"",0,"normal",10,12,,,',
        ),
        hevyRow(
          'S',
          '14 Oct 2026, 17:00',
          '14 Oct 2026, 18:00',
          'Face Pull',
          ',0,"",0,"normal",,,,,',
        ),
      ].join('\n'),
    )
    const [workout] = buildImport(file, units, fallback, OWNER).workouts
    expect(workout.document.exercises).toHaveLength(1)
    expect(workout.document.exercises[0].superset).toBeNull()
  })

  it("settles a custom exercise's tracking on all of its sets in the file", () => {
    const file = parsed(
      [
        STRONG_HEADER,
        '2026-07-01 10:00:00,"A",1h,"My Dips",1,0,10,0,0,"","",',
        '2026-07-08 10:00:00,"B",1h,"My Dips",1,20,8,0,0,"","",',
      ].join('\n'),
    )
    const plan = buildImport(file, units, fallback, OWNER)
    expect(plan.customs).toEqual([
      expect.objectContaining({ name: 'My Dips', tracking: 'weight_reps', category: 'chest' }),
    ])
    expect(plan.workouts.map((planned) => planned.document.exercises[0].tracking)).toEqual([
      'weight_reps',
      'weight_reps',
    ])
  })

  it('cuts a long name at a character, never inside an emoji', () => {
    const name = `${'x'.repeat(79)}💪 extra`
    const file = parsed(
      [STRONG_HEADER, `2026-07-01 10:00:00,"${name}",1h,"Plank",1,0,0,0,30,"","",`].join('\n'),
    )
    const [workout] = buildImport(file, units, fallback, OWNER).workouts
    expect(Array.from(workout.document.name)).toHaveLength(80)
    expect(workout.document.name.endsWith('💪')).toBe(true)
  })

  it('does not take a search tag, or an alias two entries share, for a name', () => {
    expect(matchExercise('Olympic', 'strong')).toBeNull()
    expect(matchExercise('Recovery', 'hevy')).toBeNull()
    expect(matchExercise('Push-Up', 'strong')?.id).toBe('push-up')
  })

  it("reads plurals when it guesses a custom exercise's category", () => {
    expect(categoryFor('Hammer Curls', 'weight_reps')).toBe('arms')
    expect(categoryFor('Lateral Raises', 'weight_reps')).toBe('shoulders')
    expect(categoryFor('Walking Lunges', 'reps')).toBe('legs')
  })
})

describe('matchLogged', () => {
  const plan = (workouts: [string, string, string, number][]) =>
    ({
      workouts: workouts.map(([id, startedAt, name, sets]) => ({
        customNames: [],
        document: {
          id,
          name,
          started_at: startedAt,
          exercises: [{ sets: Array.from({ length: sets }, () => ({})) }],
        },
      })),
    }) as unknown as Parameters<typeof matchLogged>[0]
  const logged = (id: string, at: string, name: string, sets: number): Logged => ({
    id,
    start: Date.parse(at),
    name: name.toLowerCase(),
    sets,
  })

  it('finds the same workout by id, by start, and shifted by a time-zone offset', () => {
    const found = matchLogged(
      plan([
        ['a', '2026-07-10T09:26:31Z', 'Back Day', 30],
        ['b', '2026-07-11T09:00:00Z', 'Legs', 20],
        ['c', '2026-07-12T09:00:00Z', 'Chest', 25],
      ]),
      [
        logged('x', '2026-07-11T09:00:20Z', 'Something', 3),
        logged('y', '2026-07-12T17:00:00Z', 'Chest', 25),
      ],
      new Set(['a']),
    )
    expect([...found].sort()).toEqual(['a', 'b', 'c'])
  })

  it('lets one logged workout stand for one file workout only', () => {
    const found = matchLogged(
      plan([
        ['morning', '2026-07-10T07:00:00Z', 'Run', 1],
        ['evening', '2026-07-10T18:00:00Z', 'Run', 1],
      ]),
      [logged('x', '2026-07-10T07:00:00Z', 'Run', 1)],
      new Set(),
    )
    expect([...found]).toEqual(['morning'])
  })

  it('does not take a same-name workout at an odd gap for a shifted copy', () => {
    const found = matchLogged(
      plan([['new', '2026-07-10T18:07:00Z', 'Run', 1]]),
      [logged('x', '2026-07-10T07:00:00Z', 'Run', 1)],
      new Set(),
    )
    expect(found.size).toBe(0)
  })
})
