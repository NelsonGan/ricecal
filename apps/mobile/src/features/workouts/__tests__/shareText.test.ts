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

const set = (kind: 'normal' | 'warmup', weightKg: number, reps: number, rpe: number | null) => ({
  id: `${kind}${weightKg}`,
  position: 0,
  kind,
  weightKg,
  reps,
  durationS: null,
  distanceM: null,
  rpe,
  volumeKg: weightKg * reps,
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
