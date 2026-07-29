import { addDays, format, setHours, setMinutes, startOfDay, subDays } from 'date-fns'

import { computeTargets } from './derive'
import type {
  Achievement,
  ActivitySession,
  Connections,
  DayLog,
  DayRings,
  Entry,
  Privacy,
  Profile,
  Reminders,
  Subscription,
  WeighIn,
} from './types'

/**
 * Seed data for a user who has been logging for a while.
 *
 * Everything is dated relative to the day the app starts, so the diary is never
 * stale and "today" is always populated. `today()` is read once at store
 * creation, not per render, so a session that crosses midnight does not shuffle
 * the user's data under them.
 */

export const dateKey = (date: Date) => format(date, 'yyyy-MM-dd')

function at(date: Date, hour: number, minute: number): string {
  return setMinutes(setHours(startOfDay(date), hour), minute).toISOString()
}

let entrySeq = 0
const nextId = (prefix: string) => `${prefix}-${++entrySeq}`

/** A fresh id for an entry the user creates. Monotonic, so lists stay stable. */
export const newEntryId = () => nextId('entry')

type SeedEntry = Omit<Entry, 'id' | 'loggedAt'> & { hour: number; minute: number }

const DAY_TEMPLATES: SeedEntry[][] = [
  // 0: a full, ordinary day
  [
    {
      foodId: 'nasi-lemak-ayam',
      meal: 'breakfast',
      quantity: 1,
      servingId: 'plate',
      hour: 8,
      minute: 20,
    },
    { foodId: 'teh-tarik', meal: 'breakfast', quantity: 1, servingId: 'cup', hour: 10, minute: 45 },
    {
      foodId: 'char-kuey-teow',
      meal: 'lunch',
      quantity: 1,
      servingId: 'plate',
      hour: 13,
      minute: 10,
    },
    { foodId: 'sup-kambing', meal: 'dinner', quantity: 1, servingId: 'bowl', hour: 19, minute: 40 },
  ],
  // 1: lighter
  [
    {
      foodId: 'kaya-toast',
      meal: 'breakfast',
      quantity: 1,
      servingId: 'piece',
      hour: 8,
      minute: 5,
    },
    { foodId: 'kopi-o', meal: 'breakfast', quantity: 1, servingId: 'cup', hour: 8, minute: 10 },
    {
      foodId: 'chicken-rice',
      meal: 'lunch',
      quantity: 1,
      servingId: 'plate',
      hour: 12,
      minute: 50,
    },
    {
      foodId: 'yong-tau-foo',
      meal: 'dinner',
      quantity: 1,
      servingId: 'piece',
      hour: 19,
      minute: 15,
    },
    { foodId: 'apple', meal: 'snack', quantity: 1, servingId: 'piece', hour: 16, minute: 30 },
  ],
  // 2: mamak heavy
  [
    {
      foodId: 'roti-canai',
      meal: 'breakfast',
      quantity: 2,
      servingId: 'piece',
      hour: 7,
      minute: 50,
    },
    { foodId: 'teh-tarik', meal: 'breakfast', quantity: 1, servingId: 'cup', hour: 7, minute: 55 },
    { foodId: 'nasi-campur', meal: 'lunch', quantity: 1, servingId: 'plate', hour: 13, minute: 25 },
    { foodId: 'mee-goreng', meal: 'dinner', quantity: 1, servingId: 'plate', hour: 20, minute: 10 },
    { foodId: 'milo-ais', meal: 'snack', quantity: 1, servingId: 'cup', hour: 16, minute: 0 },
  ],
  // 3: a quieter day
  [
    {
      foodId: 'half-boiled-eggs',
      meal: 'breakfast',
      quantity: 1,
      servingId: 'piece',
      hour: 8,
      minute: 0,
    },
    { foodId: 'kopi-o', meal: 'breakfast', quantity: 1, servingId: 'cup', hour: 8, minute: 2 },
    { foodId: 'laksa', meal: 'lunch', quantity: 1, servingId: 'bowl', hour: 12, minute: 40 },
    { foodId: 'satay-ayam', meal: 'dinner', quantity: 1, servingId: 'five', hour: 19, minute: 30 },
  ],
]

/** Today, deliberately unfinished: breakfast and lunch in, dinner still open. */
const TODAY_TEMPLATE: SeedEntry[] = [
  {
    foodId: 'nasi-lemak-ayam',
    meal: 'breakfast',
    quantity: 1,
    servingId: 'plate',
    hour: 8,
    minute: 20,
  },
  { foodId: 'teh-tarik', meal: 'breakfast', quantity: 1, servingId: 'cup', hour: 10, minute: 45 },
  {
    foodId: 'char-kuey-teow',
    meal: 'lunch',
    quantity: 1,
    servingId: 'plate',
    hour: 13,
    minute: 10,
  },
]

function buildDay(date: Date, template: SeedEntry[], waterGlasses: number): DayLog {
  return {
    date: dateKey(date),
    waterGlasses,
    entries: template.map(({ hour, minute, ...entry }) => ({
      ...entry,
      id: nextId('seed'),
      loggedAt: at(date, hour, minute),
    })),
  }
}

/** 30 days of history plus today, keyed by yyyy-MM-dd. */
export function seedDays(today: Date): Record<string, DayLog> {
  const days: Record<string, DayLog> = {}

  for (let ago = 30; ago >= 1; ago--) {
    const date = subDays(today, ago)
    const template = DAY_TEMPLATES[ago % DAY_TEMPLATES.length]
    // Vary water so the weekly average is not a flat line.
    days[dateKey(date)] = buildDay(date, template, 4 + (ago % 5))
  }

  const todayLog = buildDay(today, TODAY_TEMPLATE, 5)
  days[todayLog.date] = todayLog

  // Tomorrow onward is empty rather than absent, so the diary can page forward
  // into a real, if blank, day.
  for (let ahead = 1; ahead <= 7; ahead++) {
    const date = addDays(today, ahead)
    days[dateKey(date)] = { date: dateKey(date), entries: [], waterGlasses: 0 }
  }

  return days
}

export const SEED_PROFILE: Profile = {
  name: 'Aisyah R.',
  memberSinceMonth: 'March',
  sex: 'female',
  goal: 'lose',
  heightCm: 164,
  weightKg: 68.4,
  targetWeightKg: 65,
  age: 29,
  activity: 'light',
  foodStyles: ['halal', 'mamak', 'hawker', 'lessSugar'],
  mealTimes: [
    { meal: 'breakfast', time: '8:00 am' },
    { meal: 'lunch', time: '1:00 pm' },
    { meal: 'dinner', time: '8:00 pm' },
  ],
  source: 'tiktok',
  units: 'metric',
  energy: 'kcal',
  language: 'en',
}

export const SEED_TARGETS = computeTargets(SEED_PROFILE)

/** Twelve weekly averages trending down, ending at today's weight. */
export function seedWeighIns(today: Date): WeighIn[] {
  const start = 70.2
  const end = SEED_PROFILE.weightKg
  // A little noise so the chart does not look drawn with a ruler.
  const wobble = [0, 0.3, -0.2, 0.1, -0.35, 0.15, -0.1, 0.2, -0.25, 0.05, -0.15, 0]
  return wobble.map((offset, index) => {
    const t = index / (wobble.length - 1)
    return {
      date: dateKey(subDays(today, (wobble.length - 1 - index) * 7)),
      kg: Math.round((start + (end - start) * t + offset) * 10) / 10,
    }
  })
}

export function seedSessions(today: Date): ActivitySession[] {
  return [
    {
      id: 'session-run',
      kind: 'run',
      title: 'Morning run',
      icon: { set: 'body', name: 'running' },
      startedAt: at(today, 6, 40),
      minutes: 34,
      kcal: 248,
      distanceKm: 5.1,
      avgHr: 148,
      elevationM: 32,
      splitSeconds: [402, 418, 396, 428, 412],
    },
    {
      id: 'session-badminton',
      kind: 'badminton',
      title: 'Badminton',
      icon: { set: 'body', name: 'badminton' },
      startedAt: at(today, 21, 10),
      minutes: 45,
      kcal: 112,
    },
  ]
}

export const SEED_RINGS: DayRings = {
  steps: 8412,
  moveKcal: 360,
  moveGoal: 400,
  exerciseMin: 52,
  exerciseGoal: 45,
  standHours: 9,
  standGoal: 12,
  syncedMinutesAgo: 2,
}

/** Burn per weekday, Monday first, for the weekly chart. */
export const SEED_WEEKLY_BURN = [180, 300, 135, 325, 250, 380, 270]

export const SEED_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'seven-days',
    labelKey: 'sevenDays',
    icon: { set: 'body', name: 'streak-chain' },
    tone: 'pandan',
    earned: true,
  },
  {
    id: 'protein',
    labelKey: 'protein',
    icon: { set: 'food', name: 'protein-block' },
    tone: 'hibiscus',
    earned: true,
  },
  {
    id: 'eight-glasses',
    labelKey: 'eightGlasses',
    icon: { set: 'food', name: 'water-glass' },
    tone: 'water',
    earned: true,
  },
  {
    id: 'photo-pro',
    labelKey: 'photoPro',
    icon: { set: 'system', name: 'camera' },
    tone: 'kaya',
    earned: true,
  },
  {
    id: 'early-bird',
    labelKey: 'earlyBird',
    icon: { set: 'system', name: 'sunrise' },
    tone: 'pandan',
    earned: true,
  },
  {
    id: 'weekend',
    labelKey: 'weekend',
    icon: { set: 'system', name: 'calendar' },
    tone: 'water',
    earned: true,
  },
  {
    id: 'thirty-days',
    labelKey: 'thirtyDays',
    icon: { set: 'system', name: 'streak-calendar' },
    tone: 'pandan',
    earned: false,
  },
  {
    id: 'marathon',
    labelKey: 'marathon',
    icon: { set: 'body', name: 'running-shoe' },
    tone: 'hibiscus',
    earned: false,
  },
  {
    id: 'perfect-week',
    labelKey: 'perfectWeek',
    icon: { set: 'system', name: 'trophy' },
    tone: 'kaya',
    earned: false,
  },
]

export const SEED_SUBSCRIPTION: Subscription = {
  status: 'trial',
  plan: 'yearly',
  trialDaysLeft: 1,
  cardLast4: '4821',
  startsOn: '1 August',
}

export const SEED_REMINDERS: Reminders = {
  breakfast: true,
  lunch: true,
  dinner: false,
  water: true,
  weighIn: true,
  weeklyReport: true,
  quietFrom: '10:00 pm',
  quietTo: '7:00 am',
}

export const SEED_CONNECTIONS: Connections = {
  watch: true,
  phoneHealth: true,
  runningApp: false,
  smartScale: false,
  autoSync: true,
  wifiOnly: false,
}

export const SEED_PRIVACY: Privacy = {
  shareWithFamily: false,
  anonymousFoodData: true,
}

export const SEED_STREAK = { current: 12, best: 21 }
