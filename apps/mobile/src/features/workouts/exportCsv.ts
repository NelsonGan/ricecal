import { format } from 'date-fns'
import type { ExportRow } from '@/data'

/**
 * Every saved set as CSV, one row a set, in columns modelled on Strong's export
 * (one row a set, the workout repeated on each) with each unit in its header.
 * Headers and set types stay English: this is data for a program, not words
 * for a person.
 *
 * Weight is kilograms whatever the app shows, and says so in its header: a
 * column that changed unit with a setting would be a column nobody could add up.
 * The date is the phone's wall time: an ISO stamp in UTC is not a date Sheets
 * or Numbers recognises, and it files a workout near midnight on the wrong day.
 */
const HEADER = [
  'Date',
  'Workout Name',
  'Duration (min)',
  'Exercise Name',
  'Set Order',
  'Set Type',
  'Weight (kg)',
  'Reps',
  'Seconds',
  'Distance (m)',
  'RPE',
  'Notes',
  'Workout Notes',
]

export function workoutsCsv(rows: readonly ExportRow[]): string {
  const lines = [HEADER.join(',')]
  for (const row of rows) {
    lines.push(
      [
        format(new Date(row.startedAt), 'yyyy-MM-dd HH:mm:ss'),
        row.workoutName,
        Math.round(row.durationS / 60),
        row.exerciseName,
        row.setPosition + 1,
        row.kind,
        row.weightKg,
        row.reps,
        row.setDurationS,
        row.distanceM,
        row.rpe,
        row.exerciseNotes,
        row.workoutNotes,
      ]
        .map(cell)
        .join(','),
    )
  }
  // CRLF, which is what RFC 4180 and every spreadsheet expect.
  return `${lines.join('\r\n')}\r\n`
}

/** A field quoted only when it has to be, with its own quotes doubled. */
function cell(value: string | number | null): string {
  if (value === null) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
