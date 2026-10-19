import type { AvatarProps, IconSet, icons } from '@/ui'

type AvatarTone = NonNullable<AvatarProps['tone']>

/**
 * Made-up people and meals for the groups prototypes. Nothing here reaches the
 * server: the lab exists to feel four directions out before any of them gets a
 * table, so every screen reads from these constants and keeps its own state.
 */

/** Any one icon from the design system's sets, the way `Icon` takes it. */
export type Art = { [S in IconSet]: { set: S; name: keyof (typeof icons)[S] } }[IconSet]

/** What a group holds itself to. Chosen when the group is made. */
export type Track = 'food' | 'both'

export const TRACK_OPTIONS = [
  { value: 'food', label: 'Food only' },
  { value: 'both', label: 'Food and workouts' },
] as const satisfies readonly { value: Track; label: string }[]

export type Member = { id: string; name: string; tone: AvatarTone }

export const MEMBERS = [
  { id: 'you', name: 'You', tone: 'pandan' },
  { id: 'wei', name: 'Wei Ling', tone: 'hibiscus' },
  { id: 'priya', name: 'Priya', tone: 'water' },
  { id: 'jun', name: 'Jun Hao', tone: 'pandan' },
  { id: 'arif', name: 'Arif', tone: 'kaya' },
] as const satisfies readonly Member[]

export type MemberId = (typeof MEMBERS)[number]['id']

export function member(id: MemberId): Member {
  return MEMBERS.find((m) => m.id === id) ?? MEMBERS[0]
}

export type Meal = {
  dish: string
  kcal: number
  art: Art
  carbs: number
  protein: number
  fat: number
}

export const DISHES = {
  kayaToast: {
    dish: 'Kaya toast',
    kcal: 310,
    art: { set: 'dishes', name: 'kaya-toast' },
    carbs: 42,
    protein: 8,
    fat: 12,
  },
  rotiCanai: {
    dish: 'Roti canai',
    kcal: 360,
    art: { set: 'dishes', name: 'roti-canai' },
    carbs: 46,
    protein: 8,
    fat: 16,
  },
  nasiLemak: {
    dish: 'Nasi lemak',
    kcal: 640,
    art: { set: 'dishes', name: 'nasi-lemak' },
    carbs: 80,
    protein: 18,
    fat: 28,
  },
  cereal: {
    dish: 'Oats',
    kcal: 280,
    art: { set: 'food', name: 'cereal' },
    carbs: 48,
    protein: 10,
    fat: 6,
  },
  chickenRice: {
    dish: 'Chicken rice',
    kcal: 620,
    art: { set: 'dishes', name: 'chicken-rice' },
    carbs: 74,
    protein: 32,
    fat: 20,
  },
  charKueyTeow: {
    dish: 'Char kuey teow',
    kcal: 744,
    art: { set: 'dishes', name: 'char-kuey-teow' },
    carbs: 88,
    protein: 24,
    fat: 33,
  },
  laksa: {
    dish: 'Laksa',
    kcal: 590,
    art: { set: 'dishes', name: 'laksa' },
    carbs: 62,
    protein: 22,
    fat: 27,
  },
  thosai: {
    dish: 'Thosai',
    kcal: 330,
    art: { set: 'dishes', name: 'thosai' },
    carbs: 52,
    protein: 8,
    fat: 9,
  },
  bakKutTeh: {
    dish: 'Bak kut teh',
    kcal: 520,
    art: { set: 'dishes', name: 'bak-kut-teh' },
    carbs: 18,
    protein: 38,
    fat: 32,
  },
  ayamPenyet: {
    dish: 'Ayam penyet',
    kcal: 680,
    art: { set: 'dishes', name: 'ayam-penyet' },
    carbs: 58,
    protein: 36,
    fat: 33,
  },
  kopiO: {
    dish: 'Kopi O',
    kcal: 58,
    art: { set: 'dishes', name: 'kopi-o' },
    carbs: 14,
    protein: 0,
    fat: 0,
  },
} as const satisfies Record<string, Meal>
