import type { TFunction } from 'i18next'
import type { WorkoutDetail } from '@/data'
import { workoutShareText } from '../shareText'

const words: Record<string, string> = {
  'common:unit.kg': 'kg',
  'workouts:logger.kindBadge.warmup': 'W',
}
const t = ((key: string, options?: Record<string, unknown>) =>
  words[key] ?? (options ? `${key} ${JSON.stringify(options)}` : key)) as unknown as TFunction<
  ['workouts', 'common']
>

const set = (
  kind: 'normal' | 'warmup',
  weightKg: number | null,
  reps: number | null,
  rpe: number | null,
) => ({
  id: `${kind}${weightKg}`,
  position: 0,
  kind,
  weightKg,
  reps,
  durationS: null,
  distanceM: null,
  rpe,
  volumeKg: (weightKg ?? 0) * (reps ?? 0),
  e1rmKg: null,
  records: [],
})

it('writes the name, the size of the session, and every set with its badge and effort', () => {
  const workout = {
    id: 'w',
    name: 'Push day',
    startedAt: '2026-10-15T10:00:00.000Z',
    durationS: 3720,
    volumeKg: 2100,
    entries: [
      {
        id: 'e',
        position: 0,
        exerciseId: 'barbell-bench-press',
        name: 'Bench Press (Barbell)',
        tracking: 'weight_reps',
        superset: null,
        restS: null,
        notes: null,
        sets: [set('warmup', 40, 10, null), set('normal', 60, 8, 8)],
      },
    ],
  } as unknown as WorkoutDetail
  const text = workoutShareText(t, workout, 'kg', 'km')
  const [head, block] = text.split('\n\n')
  expect(head.split('\n')[0]).toBe('Push day')
  expect(block.split('\n')).toEqual(['Bench Press (Barbell)', 'W  40 kg × 10', '1  60 kg × 8 @8'])
})

it('dates an older workout with its year, hides a zero volume, converts to lb and skips a cleared set', () => {
  const entry = (name: string, tracking: string, sets: ReturnType<typeof set>[]) => ({
    id: name,
    position: 0,
    exerciseId: name,
    name,
    tracking,
    superset: null,
    restS: null,
    notes: null,
    sets,
  })
  const workout = {
    id: 'w',
    name: 'Pull day',
    startedAt: '2025-03-02T10:00:00.000Z',
    durationS: 1800,
    volumeKg: 0,
    entries: [
      entry('Pull-Up (Weighted)', 'weighted_reps', [
        set('normal', 0, 10, null),
        set('normal', null, null, null),
      ]),
    ],
  } as unknown as WorkoutDetail
  const [head, block] = workoutShareText(t, workout, 'lb', 'mi').split('\n\n')
  const [, summary] = head.split('\n')
  expect(summary.startsWith('2 Mar 2025')).toBe(true)
  expect(summary).not.toContain('common:unit.lb')
  expect(block.split('\n')).toEqual(['Pull-Up (Weighted)', '1  × 10'])

  const heavy = {
    ...workout,
    volumeKg: 300,
    entries: [entry('Bench Press (Barbell)', 'weight_reps', [set('normal', 60, 5, 9)])],
  } as unknown as WorkoutDetail
  const lines = workoutShareText(t, heavy, 'lb', 'mi').split('\n\n')[1].split('\n')
  expect(lines[1]).toMatch(/^1 {2}132(\.\d+)? common:unit\.lb × 5 @9$/)
})
