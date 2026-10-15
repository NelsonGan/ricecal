import { format } from 'date-fns'
import type { ExportRow } from '@/data'
import { workoutsCsv } from '../exportCsv'

const row: ExportRow = {
  workoutId: 'w',
  workoutName: 'Push, heavy',
  workoutNotes: 'Felt "great"\nnew PR',
  startedAt: '2026-10-15T10:00:00.000Z',
  durationS: 3720,
  exerciseName: 'Bench Press (Barbell)',
  exercisePosition: 0,
  setPosition: 1,
  kind: 'normal',
  weightKg: 60,
  reps: 8,
  setDurationS: null,
  distanceM: null,
  rpe: 8,
}

it('writes a header and one row a set, quoting what needs it', () => {
  const [header, line, end] = workoutsCsv([row]).split('\r\n')
  expect(header.split(',')[0]).toBe('Date')
  // Wall time in whatever zone the test runs in, as on the phone.
  const local = format(new Date(row.startedAt), 'yyyy-MM-dd HH:mm:ss')
  expect(line).toBe(
    `${local},"Push, heavy",62,Bench Press (Barbell),2,normal,60,8,,,8,"Felt ""great""\nnew PR"`,
  )
  expect(end).toBe('')
})
