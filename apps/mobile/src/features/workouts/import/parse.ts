import type { WeightUnit } from '@/lib/units'
import type { SetKind } from '../model'
import { parseCsv } from './csv'

/**
 * A Strong or Hevy export read into workouts, before anything is matched or
 * saved. Pure, so the whole format can be tested from strings.
 *
 * Both apps write one row per set, with the workout's name and start repeated
 * on every row. Strong adds a "Rest Timer" row after each set; Hevy numbers
 * supersets. Numbers stay in the file's own units here, because Strong does
 * not say which units it wrote: the person importing does, on the preview, and
 * `build.ts` converts.
 *
 * Nothing throws on a bad row. A history of thousands of sets will hold a
 * typo or two, and losing the whole file over one helps nobody, so a row that
 * cannot be read is skipped and counted: a file of nothing but such rows is
 * told apart from an empty one.
 */

export type ImportSource = 'strong' | 'hevy'
export type { WeightUnit } from '@/lib/units'
/** The units a file can write a distance in: a carry is metres. */
export type FileDistanceUnit = 'km' | 'mi' | 'm'

/** A wall-clock time as the file wrote it: both apps write local time with no zone. */
export type LocalTime = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export type ParsedSet = {
  kind: SetKind
  weight: number | null
  /** The weight's unit when the file says it; null when only the person importing knows. */
  weightUnit: WeightUnit | null
  reps: number | null
  durationS: number | null
  distance: number | null
  distanceUnit: FileDistanceUnit | null
  rpe: number | null
}

export type ParsedExercise = {
  name: string
  /** The file's own superset label, shared by the exercises done as one. */
  superset: string | null
  notes: string[]
  /** Every rest Strong timed after a set of this exercise, in seconds. */
  rests: number[]
  sets: ParsedSet[]
}

type ParsedWorkout = {
  /** What tells this workout apart in the file: its start and its name. */
  key: string
  name: string
  notes: string | null
  start: LocalTime
  /** From the end time or the written duration; null when the file has neither. */
  durationS: number | null
  exercises: ParsedExercise[]
}

export type ParsedExport = {
  source: ImportSource
  workouts: ParsedWorkout[]
  /** Rows with no exercise or no readable date. */
  skippedRows: number
  /** Whether any set is a weight or a distance in a unit the file does not name. */
  unitless: { weight: boolean; distance: boolean }
}

type ParseError = { error: 'empty' | 'unknown' }

/** A header, lower case with punctuation as spaces: "Weight (kg)" reads "weight kg". */
const normalize = (header: string) =>
  header
    .toLowerCase()
    .replace(/#/g, ' no ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export function parseExport(text: string): ParsedExport | ParseError {
  const rows = parseCsv(text)
  if (rows.length < 2) return { error: 'empty' }
  const header = rows[0].map(normalize)
  if (header.includes('exercise name') && header.includes('set order')) {
    return parseStrong(header, rows.slice(1))
  }
  if (header.includes('exercise title') && header.includes('set index')) {
    return parseHevy(header, rows.slice(1))
  }
  return { error: 'unknown' }
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * A number from a cell, or null for an empty one. A comma is a decimal point:
 * a comma-separated file quotes any cell that holds one, and a semicolon file
 * from a comma-decimal locale writes them bare. Negative is read as its size: an older Strong export
 * writes an assisted set's help as a negative weight.
 */
function number(cell: string | undefined): number | null {
  const text = (cell ?? '').trim().replace(',', '.')
  if (!text) return null
  const value = Number(text)
  return Number.isFinite(value) ? Math.abs(value) : null
}

/** A count or a measure, where both apps write 0 for "nothing entered". */
const positive = (cell: string | undefined) => {
  const value = number(cell)
  return value === null || value === 0 ? null : value
}

const weightUnitOf = (text: string): WeightUnit | null => {
  const unit = text.trim().toLowerCase()
  if (unit.startsWith('lb') || unit.startsWith('pound')) return 'lb'
  if (unit.startsWith('kg') || unit.startsWith('kilo')) return 'kg'
  return null
}

const distanceUnitOf = (text: string): FileDistanceUnit | null => {
  const unit = text.trim().toLowerCase()
  if (unit === 'mi' || unit.startsWith('mile')) return 'mi'
  if (unit === 'km' || unit.startsWith('kilo')) return 'km'
  if (unit === 'm' || unit.startsWith('met')) return 'm'
  return null
}

/** An RPE on its 1 to 10 scale, or null. Hevy writes nothing and Strong 0 for unrated. */
function rpeOf(cell: string | undefined): number | null {
  const value = number(cell)
  if (value === null || value < 1) return null
  return Math.min(10, Math.round(value * 10) / 10)
}

function localTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): LocalTime | null {
  const check = new Date(Date.UTC(year, month - 1, day))
  if (
    year < 1900 ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null
  }
  return { year, month, day, hour, minute, second }
}

/** Strong's "2025-07-09 11:13:00", and any ISO-shaped date a spreadsheet leaves behind. */
function isoTime(text: string): LocalTime | null {
  const match = text
    .trim()
    .match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (!match) return null
  const [, y, mo, d, h, mi, s] = match
  return localTime(+y, +mo, +d, h ? +h : 0, mi ? +mi : 0, s ? +s : 0)
}

/**
 * Month names as Hevy writes them. Hevy writes the date in the language the
 * app is set to, so an English table alone drops a French history's "févr."
 * and "août" without a word. Keys are lower case without accents; a name is
 * tried whole, then by its first four letters, then its first three; "май"
 * is keyed "маи" because stripping accents takes the breve off its й. Chinese,
 * Japanese and Korean write the month as a number ("10月", "10월").
 */
// biome-ignore format: one language per line
const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  janv: 1, fevr: 2, mars: 3, avr: 4, avri: 4, mai: 5, juin: 6, juil: 7, aout: 8, octo: 10, nove: 11, dece: 12,
  ene: 1, abr: 4, ago: 8, dic: 12,
  fev: 2, set: 9, out: 10, dez: 12,
  mrz: 3, marz: 3, okt: 10,
  mrt: 3, maart: 3, mei: 5,
  gen: 1, mag: 5, giu: 6, lug: 7, ott: 10,
  agu: 8, agt: 8, des: 12,
  maj: 5,
  sty: 1, lut: 2, kwi: 4, cze: 6, lip: 7, sie: 8, wrz: 9, paz: 10, lis: 11, gru: 12,
  oca: 1, sub: 2, nis: 4, haz: 6, tem: 7, eyl: 9, eki: 10, kas: 11, ara: 12,
  янв: 1, фев: 2, мар: 3, апр: 4, маи: 5, мая: 5, июн: 6, июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
}

function monthOf(word: string): number | null {
  const numbered = word.match(/^(\d{1,2})\s*[月월]$/)
  if (numbered) return +numbered[1] >= 1 && +numbered[1] <= 12 ? +numbered[1] : null
  const key = word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.$/, '')
  return MONTHS[key] ?? MONTHS[key.slice(0, 4)] ?? MONTHS[key.slice(0, 3)] ?? null
}

/** An hour read off a 12-hour clock, when the time carries AM or PM. */
function hour24(hour: number, meridiem: string | undefined): number {
  if (!meridiem) return hour
  const pm = /^p/i.test(meridiem)
  return (hour % 12) + (pm ? 12 : 0)
}

// Anchored at the end: an AM/PM this does not recognise must fail the date
// rather than be dropped, which read "5:14 p. m." as 05:14, twelve hours early.
// The marker may be spaced ("p. m.") and the seconds may be there.
const CLOCK = String.raw`(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AaPp])\.?\s?[Mm]\.?)?\s*$`
// Compiled once: an export repeats them on every row, twice.
const DAY_FIRST = new RegExp(
  String.raw`^(\d{1,2})\.?\s+([\p{L}\d]+\.?)\s+(\d{4}),?\s+${CLOCK}`,
  'u',
)
const MONTH_FIRST = new RegExp(String.raw`^(\p{L}+\.?)\s+(\d{1,2}),?\s+(\d{4}),?\s+${CLOCK}`, 'u')
const YEAR_FIRST = new RegExp(
  String.raw`^(\d{4})\s*[年년]\s*(\d{1,2})\s*[月월]\s*(\d{1,2})\s*[日일]?,?\s+${CLOCK}`,
  'u',
)

/**
 * Hevy's "14 Oct 2026, 17:14", in whichever language and clock, or an ISO
 * date. Month first ("Oct 14, 2026, 5:14 PM") and year first
 * ("2026年10月14日 17:14") are read too, since the order follows the language.
 */
function hevyTime(text: string): LocalTime | null {
  const value = text.trim()
  // Which group holds the day and which the month; the year and clock follow both.
  for (const [pattern, day, name] of [
    [DAY_FIRST, 1, 2],
    [MONTH_FIRST, 2, 1],
  ] as const) {
    const match = value.match(pattern)
    const month = match && monthOf(match[name])
    if (match && month) {
      return localTime(+match[3], month, +match[day], hour24(+match[4], match[6]), +match[5])
    }
  }
  const yearFirst = value.match(YEAR_FIRST)
  if (yearFirst) {
    return localTime(
      +yearFirst[1],
      +yearFirst[2],
      +yearFirst[3],
      hour24(+yearFirst[4], yearFirst[6]),
      +yearFirst[5],
    )
  }
  return isoTime(value)
}

const minutesToSeconds = (minutes: number | null) => (minutes === null ? null : minutes * 60)

/** A set type written out, as this app's export and Hevy's write it: "warmup", "dropset". */
function kindOf(text: string): SetKind | null {
  const type = text.toLowerCase()
  if (type.startsWith('warm')) return 'warmup'
  if (type.startsWith('drop')) return 'drop'
  if (type.startsWith('fail')) return 'failure'
  return type === 'normal' ? 'normal' : null
}

/** Strong's workout length: "1h 5m", "57m", "45s". */
function strongDuration(text: string): number | null {
  const value = text.trim().toLowerCase()
  if (!value) return null
  const hours = value.match(/(\d+)\s*h/)
  const minutes = value.match(/(\d+)\s*m(?!s)/)
  const seconds = value.match(/(\d+)\s*s/)
  if (!hours && !minutes && !seconds) return number(value)
  return (
    (hours ? +hours[1] * 3600 : 0) + (minutes ? +minutes[1] * 60 : 0) + (seconds ? +seconds[1] : 0)
  )
}

/** Seconds from one wall-clock time to another, both in the same unnamed zone. */
function secondsBetween(from: LocalTime, to: LocalTime): number {
  const at = (t: LocalTime) => Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second)
  return Math.round((at(to) - at(from)) / 1000)
}

const timeKey = (t: LocalTime) => `${t.year}-${t.month}-${t.day} ${t.hour}:${t.minute}:${t.second}`

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

type Builder = {
  workouts: Map<string, ParsedWorkout>
  /** Each workout's exercise in progress, and the superset it belongs to. */
  runs: Map<string, Run>
}

type Run = {
  current: ParsedExercise | null
  superset: string | null
  /** The exercises of the superset in progress, by name. */
  members: Map<string, ParsedExercise>
}

function workoutFor(
  builder: Builder,
  key: string,
  make: () => Omit<ParsedWorkout, 'key' | 'exercises'>,
): ParsedWorkout {
  let workout = builder.workouts.get(key)
  if (!workout) {
    workout = { key, exercises: [], ...make() }
    builder.workouts.set(key, workout)
  }
  return workout
}

/**
 * The exercise a row belongs to, in the order the workout did them. Rows of
 * one exercise are consecutive, so a name that comes back after another
 * exercise is a second block of it and stays a second entry: bench, squat,
 * bench again is three exercises, not two with the order lost. A superset's
 * rows alternate between its exercises, so within one superset the rows are
 * grouped by name.
 */
function exerciseFor(
  builder: Builder,
  workout: ParsedWorkout,
  name: string,
  superset: string | null,
): ParsedExercise {
  let run = builder.runs.get(workout.key)
  if (!run) {
    run = { current: null, superset: null, members: new Map() }
    builder.runs.set(workout.key, run)
  }
  const key = name.toLowerCase()
  if (superset !== null && superset === run.superset) {
    const member = run.members.get(key)
    if (member) {
      run.current = member
      return member
    }
  } else if (
    superset === null &&
    run.superset === null &&
    run.current?.name.toLowerCase() === key
  ) {
    return run.current
  }
  if (superset !== run.superset) run.members = new Map()
  const exercise: ParsedExercise = { name, superset, notes: [], rests: [], sets: [] }
  workout.exercises.push(exercise)
  run.current = exercise
  run.superset = superset
  if (superset !== null) run.members.set(key, exercise)
  return exercise
}

function addNote(list: string[], note: string) {
  const text = note.trim()
  if (text && !list.includes(text)) list.push(text)
}

/** Earliest first, the order a history reads in. */
function sorted(workouts: Iterable<ParsedWorkout>): ParsedWorkout[] {
  return [...workouts].sort((a, b) => secondsBetween(b.start, a.start))
}

// ---------------------------------------------------------------------------
// Strong
// ---------------------------------------------------------------------------

/**
 * Strong: `Date, Workout Name, Duration, Exercise Name, Set Order, Weight,
 * Reps, Distance, Seconds, Notes, Workout Notes, RPE`.
 *
 * Set Order is the set's number, or W, D and F for a warm-up, a drop set and a
 * failure set, or "Rest Timer" for the rest Strong timed after it (its length
 * in Seconds). Duration is the whole workout's, on every row; a set's own time
 * is Seconds. Weight and Distance are in whatever units the app was set to,
 * and the file does not say, unless an older export's unit columns do.
 */
function parseStrong(header: string[], rows: string[][]): ParsedExport {
  const col = (...names: string[]) => header.findIndex((name) => names.includes(name))
  const c = {
    date: col('date'),
    name: col('workout name'),
    duration: col('duration', 'workout duration'),
    durationSec: col('duration sec', 'duration secs', 'duration s'),
    // This app's own export reads as Strong's, with minutes and a set type.
    durationMin: col('duration min'),
    exercise: col('exercise name'),
    order: col('set order'),
    type: col('set type'),
    weight: col('weight', 'weight kg', 'weight lbs', 'weight lb'),
    weightUnit: col('weight unit'),
    reps: col('reps'),
    distance: col(
      'distance',
      'distance km',
      'distance mi',
      'distance miles',
      'distance m',
      'distance meters',
      'distance metres',
    ),
    distanceUnit: col('distance unit'),
    seconds: col('seconds'),
    notes: col('notes'),
    workoutNotes: col('workout notes'),
    rpe: col('rpe'),
  }
  const headerWeightUnit = c.weight === -1 ? null : weightUnitOf(header[c.weight].slice(7))
  const headerDistanceUnit = c.distance === -1 ? null : distanceUnitOf(header[c.distance].slice(9))

  const builder: Builder = { workouts: new Map(), runs: new Map() }
  const unitless = { weight: false, distance: false }
  let skipped = 0

  for (const row of rows) {
    const cell = (index: number) => (index === -1 ? '' : (row[index] ?? '').trim())
    const name = cell(c.exercise)
    const start = isoTime(cell(c.date))
    if (!name || !start) {
      skipped++
      continue
    }
    const workoutName = cell(c.name)
    const workout = workoutFor(builder, `${timeKey(start)}|${workoutName}`, () => ({
      name: workoutName,
      notes: cell(c.workoutNotes) || null,
      start,
      durationS:
        c.durationSec !== -1
          ? number(cell(c.durationSec))
          : c.durationMin !== -1
            ? minutesToSeconds(number(cell(c.durationMin)))
            : strongDuration(cell(c.duration)),
    }))
    const exercise = exerciseFor(builder, workout, name, null)
    const order = cell(c.order).toLowerCase()

    if (order.startsWith('rest')) {
      const rest = positive(cell(c.seconds))
      if (rest !== null) exercise.rests.push(rest)
      continue
    }

    addNote(exercise.notes, cell(c.notes))
    const weight = positive(cell(c.weight))
    const distance = positive(cell(c.distance))
    const weightUnit = weightUnitOf(cell(c.weightUnit)) ?? headerWeightUnit
    const distanceUnit = distanceUnitOf(cell(c.distanceUnit)) ?? headerDistanceUnit
    if (weight !== null && !weightUnit) unitless.weight = true
    if (distance !== null && !distanceUnit) unitless.distance = true
    exercise.sets.push({
      kind:
        kindOf(cell(c.type)) ??
        (order === 'w' ? 'warmup' : order === 'd' ? 'drop' : order === 'f' ? 'failure' : 'normal'),
      weight,
      weightUnit,
      reps: positive(cell(c.reps)),
      durationS: positive(cell(c.seconds)),
      distance,
      distanceUnit,
      rpe: rpeOf(cell(c.rpe)),
    })
  }

  return {
    source: 'strong',
    workouts: sorted(builder.workouts.values()),
    skippedRows: skipped,
    unitless,
  }
}

// ---------------------------------------------------------------------------
// Hevy
// ---------------------------------------------------------------------------

/**
 * Hevy: `title, start_time, end_time, description, exercise_title,
 * superset_id, exercise_notes, set_index, set_type, weight_kg, reps,
 * distance_km, duration_seconds, rpe`. The weight and distance columns name
 * their unit (`weight_lbs`, `distance_miles` for an account in pounds), and
 * set_type is normal, warmup, dropset or failure.
 */
function parseHevy(header: string[], rows: string[][]): ParsedExport {
  const col = (...names: string[]) => header.findIndex((name) => names.includes(name))
  const c = {
    title: col('title'),
    start: col('start time'),
    end: col('end time'),
    description: col('description'),
    exercise: col('exercise title'),
    superset: col('superset id'),
    notes: col('exercise notes'),
    type: col('set type'),
    weightKg: col('weight kg'),
    weightLb: col('weight lbs', 'weight lb'),
    reps: col('reps'),
    distanceKm: col('distance km'),
    distanceMi: col('distance miles', 'distance mi'),
    distanceM: col('distance meters', 'distance m'),
    duration: col('duration seconds'),
    rpe: col('rpe'),
  }

  const builder: Builder = { workouts: new Map(), runs: new Map() }
  let skipped = 0

  for (const row of rows) {
    const cell = (index: number) => (index === -1 ? '' : (row[index] ?? '').trim())
    const name = cell(c.exercise)
    const start = hevyTime(cell(c.start))
    if (!name || !start) {
      skipped++
      continue
    }
    const title = cell(c.title)
    const end = hevyTime(cell(c.end))
    const workout = workoutFor(builder, `${timeKey(start)}|${title}`, () => ({
      name: title,
      notes: cell(c.description) || null,
      start,
      durationS: end ? Math.max(0, secondsBetween(start, end)) : null,
    }))
    const exercise = exerciseFor(builder, workout, name, cell(c.superset) || null)
    addNote(exercise.notes, cell(c.notes))

    const kg = positive(cell(c.weightKg))
    const lb = positive(cell(c.weightLb))
    const km = positive(cell(c.distanceKm))
    const mi = positive(cell(c.distanceMi))
    const m = positive(cell(c.distanceM))
    exercise.sets.push({
      kind: kindOf(cell(c.type)) ?? 'normal',
      weight: kg ?? lb,
      weightUnit: kg !== null ? 'kg' : lb !== null ? 'lb' : null,
      reps: positive(cell(c.reps)),
      durationS: positive(cell(c.duration)),
      distance: km ?? mi ?? m,
      distanceUnit: km !== null ? 'km' : mi !== null ? 'mi' : m !== null ? 'm' : null,
      rpe: rpeOf(cell(c.rpe)),
    })
  }

  return {
    source: 'hevy',
    workouts: sorted(builder.workouts.values()),
    skippedRows: skipped,
    unitless: { weight: false, distance: false },
  }
}
